// utils/database.js
const admin = require('firebase-admin');
const config = require('../config/config.js');
const logger = require('./logger.js');

class Database {
    constructor() {
        this.db = null;
        this.init();
    }

    /**
     * Firebase Admin SDKを初期化
     */
    init() {
        try {
            // Firebase Admin SDKの初期化
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(config.firebase.serviceAccount),
                    databaseURL: config.firebase.databaseURL
                });
            }

            this.db = admin.firestore();

            // Firestoreの設定
            this.db.settings({
                timestampsInSnapshots: true
            });

            logger.info('Firebase Firestoreに接続しました');

        } catch (error) {
            logger.error('Firebase初期化エラー:', error);
            throw error;
        }
    }

    /**
     * コレクションの参照を取得
     */
    getCollections() {
        return {
            sentNotifications: this.db.collection('sent_notifications'),
            videoStatus: this.db.collection('video_status'), // 新しいコレクション
            streamers: this.db.collection('streamers'),
            errorLogs: this.db.collection('error_logs')
        };
    }

    /**
     * コンテンツの通知判定をチェック（状態も考慮）
     * @param {string} contentId - コンテンツID
     * @param {string} currentStatus - 現在の状態 ('upcoming', 'live', 'video')
     * @returns {Promise<{shouldNotify: boolean, statusChanged: boolean, previousStatus: string|null, notificationType: string}>}
     */
    async checkNotificationStatus(contentId, currentStatus = 'video') {
        try {
            const { sentNotifications, videoStatus } = this.getCollections();

            // 動画状態履歴をチェック
            const statusDoc = await videoStatus.doc(contentId).get();
            const previousStatus = statusDoc.exists ? statusDoc.data().status : null;

            // 状態変化を検出
            const statusChanged = previousStatus && previousStatus !== currentStatus;

            // 初回通知の送信履歴をチェック
            const initialSentDoc = await sentNotifications.doc(contentId).get();

            // 状態変化通知の送信履歴をチェック（配信予定→ライブの場合）
            const statusChangeSentDoc = await sentNotifications.doc(`${contentId}_live_status_change`).get();

            // 通知すべきかを判定
            let shouldNotify = false;
            let notificationType = 'initial';

            if (!initialSentDoc.exists) {
                // 初回通知（まだ一度も通知していない）
                shouldNotify = true;
                notificationType = 'initial';
            } else if (statusChanged && previousStatus === 'upcoming' && currentStatus === 'live') {
                // 配信予定 → ライブ配信開始の状態変化
                if (!statusChangeSentDoc.exists) {
                    // 状態変化通知をまだ送信していない
                    shouldNotify = true;
                    notificationType = 'status_change';
                }
            }

            return {
                shouldNotify,
                statusChanged,
                previousStatus,
                notificationType
            };

        } catch (error) {
            logger.error('通知状態チェックエラー:', error);
            return {
                shouldNotify: false,
                statusChanged: false,
                previousStatus: null,
                notificationType: 'initial'
            };
        }
    }

    /**
     * 後方互換性のためのメソッド（既存コードとの互換性維持）
     * @param {string} contentId - コンテンツID
     * @returns {Promise<boolean>} 送信済みの場合true
     */
    async checkIfSent(contentId) {
        try {
            const { sentNotifications } = this.getCollections();
            const doc = await sentNotifications.doc(contentId).get();
            return doc.exists;
        } catch (error) {
            logger.error('送信済みチェックエラー:', error);
            return false;
        }
    }

    /**
     * 動画の状態を記録/更新
     * @param {string} contentId - コンテンツID
     * @param {string} status - 動画の状態 ('upcoming', 'live', 'video')
     * @param {Object} videoInfo - 動画情報
     * @returns {Promise<void>}
     */
    async updateVideoStatus(contentId, status, videoInfo = {}) {
        try {
            const { videoStatus } = this.getCollections();

            await videoStatus.doc(contentId).set({
                contentId,
                status,
                title: videoInfo.title || '',
                streamerName: videoInfo.streamerName || '',
                platform: videoInfo.platform || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                // 初回記録の場合のみcreatedAtを設定
                ...(!(await videoStatus.doc(contentId).get()).exists && {
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                })
            }, { merge: true });

            logger.debug(`動画状態を更新: ${contentId} -> ${status}`);

        } catch (error) {
            logger.error('動画状態更新エラー:', error);
            throw error;
        }
    }

    /**
     * 送信済みとしてマーク（ドキュメントIDを直接指定）
     * @param {string} docId - ドキュメントID
     * @param {string} streamerName - 配信者名
     * @param {string} platform - プラットフォーム
     * @param {string} status - 動画の状態
     * @param {string} notificationType - 通知タイプ ('initial', 'status_change')
     * @returns {Promise<void>}
     */
    async markAsSent(docId, streamerName = '', platform = '', status = 'video', notificationType = 'initial') {
        try {
            const { sentNotifications } = this.getCollections();

            await sentNotifications.doc(docId).set({
                contentId: docId.includes('_') ? docId.split('_')[0] : docId, // 元の動画IDを記録
                docId: docId, // 実際のドキュメントID
                streamerName,
                platform,
                status,
                notificationType,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            logger.debug(`送信履歴を記録: ${docId} (${notificationType})`);

        } catch (error) {
            logger.error('送信済みマークエラー:', error);
            throw error;
        }
    }

    /**
     * 特定の動画の状態履歴を取得
     * @param {string} contentId - コンテンツID
     * @returns {Promise<Array>} 状態履歴
     */
    async getVideoStatusHistory(contentId) {
        try {
            const { videoStatus, sentNotifications } = this.getCollections();

            // 状態履歴と通知履歴を並列取得
            const [statusDoc, notificationSnapshot] = await Promise.all([
                videoStatus.doc(contentId).get(),
                sentNotifications.where('contentId', '==', contentId)
                    .orderBy('sentAt', 'desc')
                    .get()
            ]);

            const history = {
                currentStatus: statusDoc.exists ? statusDoc.data() : null,
                notifications: notificationSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    sentAt: doc.data().sentAt?.toDate()
                }))
            };

            return history;

        } catch (error) {
            logger.error('動画状態履歴取得エラー:', error);
            return { currentStatus: null, notifications: [] };
        }
    }

    /**
     * 配信者情報を保存/更新
     * @param {Object} streamer - 配信者情報
     * @returns {Promise<void>}
     */
    async saveStreamer(streamer) {
        try {
            const { streamers } = this.getCollections();
            const docId = `${streamer.platform}_${streamer.channelId}`;

            await streamers.doc(docId).set({
                name: streamer.name,
                platform: streamer.platform,
                channelId: streamer.channelId,
                notificationChannelId: streamer.notificationChannelId,
                customMessage: streamer.customMessage || null,
                mentionRole: streamer.mentionRole || null,
                lastChecked: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            logger.error('配信者情報保存エラー:', error);
            throw error;
        }
    }

    /**
     * エラーログを保存
     * @param {Error} error - エラーオブジェクト
     * @param {string} streamerName - 配信者名
     * @param {string} platform - プラットフォーム
     * @returns {Promise<void>}
     */
    async logError(error, streamerName = null, platform = null) {
        try {
            const { errorLogs } = this.getCollections();
            await errorLogs.add({
                errorMessage: error.message,
                stackTrace: error.stack,
                streamerName,
                platform,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            logger.error('エラーログ保存エラー:', err);
        }
    }

    /**
     * 古い記録を削除 (デフォルト: 30日以上古い記録)
     * @param {number} daysToKeep - 保持する日数
     * @returns {Promise<void>}
     */
    async cleanup(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const { sentNotifications, videoStatus, errorLogs } = this.getCollections();

            // 古い送信済み通知を削除
            const oldNotifications = await sentNotifications
                .where('createdAt', '<', cutoffDate)
                .get();

            const batch1 = this.db.batch();
            oldNotifications.docs.forEach(doc => {
                batch1.delete(doc.ref);
            });

            if (!oldNotifications.empty) {
                await batch1.commit();
            }

            // 古い動画状態記録を削除
            const oldVideoStatus = await videoStatus
                .where('createdAt', '<', cutoffDate)
                .get();

            const batch2 = this.db.batch();
            oldVideoStatus.docs.forEach(doc => {
                batch2.delete(doc.ref);
            });

            if (!oldVideoStatus.empty) {
                await batch2.commit();
            }

            // 古いエラーログを削除
            const oldErrorLogs = await errorLogs
                .where('createdAt', '<', cutoffDate)
                .get();

            const batch3 = this.db.batch();
            oldErrorLogs.docs.forEach(doc => {
                batch3.delete(doc.ref);
            });

            if (!oldErrorLogs.empty) {
                await batch3.commit();
            }

            logger.info(`データベースクリーンアップ完了 (${daysToKeep}日以上古い記録を削除)`);
        } catch (error) {
            logger.error('データベースクリーンアップエラー:', error);
            throw error;
        }
    }

    /**
     * 統計情報を取得
     * @returns {Promise<Object>} 統計情報
     */
    async getStats() {
        try {
            const { sentNotifications, streamers, errorLogs, videoStatus } = this.getCollections();

            // 24時間前の時刻を計算
            const yesterday = new Date();
            yesterday.setHours(yesterday.getHours() - 24);

            // 並列でクエリを実行
            const [
                totalNotificationsSnapshot,
                recentNotificationsSnapshot,
                totalStreamersSnapshot,
                recentErrorsSnapshot,
                totalVideoStatusSnapshot,
                liveVideosSnapshot
            ] = await Promise.all([
                sentNotifications.get(),
                sentNotifications.where('sentAt', '>', yesterday).get(),
                streamers.get(),
                errorLogs.where('createdAt', '>', yesterday).get(),
                videoStatus.get(),
                videoStatus.where('status', '==', 'live').get()
            ]);

            return {
                totalNotifications: totalNotificationsSnapshot.size,
                recentNotifications: recentNotificationsSnapshot.size,
                totalStreamers: totalStreamersSnapshot.size,
                totalErrors: recentErrorsSnapshot.size,
                totalTrackedVideos: totalVideoStatusSnapshot.size,
                currentLiveStreams: liveVideosSnapshot.size
            };
        } catch (error) {
            logger.error('統計情報取得エラー:', error);
            throw error;
        }
    }

    /**
     * 特定の配信者の送信履歴を取得
     * @param {string} streamerName - 配信者名
     * @param {number} limit - 取得する件数制限
     * @returns {Promise<Array>} 送信履歴
     */
    async getStreamerHistory(streamerName, limit = 10) {
        try {
            const { sentNotifications } = this.getCollections();
            const snapshot = await sentNotifications
                .where('streamerName', '==', streamerName)
                .orderBy('sentAt', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                sentAt: doc.data().sentAt?.toDate()
            }));
        } catch (error) {
            logger.error('配信者履歴取得エラー:', error);
            throw error;
        }
    }

    /**
     * 配信者一覧を取得
     * @returns {Promise<Array>} 配信者一覧
     */
    async getAllStreamers() {
        try {
            const { streamers } = this.getCollections();
            const snapshot = await streamers.get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastChecked: doc.data().lastChecked?.toDate(),
                updatedAt: doc.data().updatedAt?.toDate()
            }));
        } catch (error) {
            logger.error('配信者一覧取得エラー:', error);
            throw error;
        }
    }

    /**
     * 最近のエラーログを取得
     * @param {number} limit - 取得する件数制限
     * @returns {Promise<Array>} エラーログ一覧
     */
    async getRecentErrors(limit = 20) {
        try {
            const { errorLogs } = this.getCollections();
            const snapshot = await errorLogs
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate()
            }));
        } catch (error) {
            logger.error('エラーログ取得エラー:', error);
            throw error;
        }
    }

    /**
     * Firestoreコネクションを終了
     * @returns {Promise<void>}
     */
    async close() {
        try {
            // Firebase Admin SDKでは明示的な接続終了は通常不要
            logger.info('Firestoreコネクションを終了しました');
        } catch (error) {
            logger.error('Firestoreコネクション終了エラー:', error);
        }
    }
}

module.exports = Database;