// services/RssDatabase.js
const admin = require('firebase-admin');
const crypto = require('crypto');
const logger = require('../utils/logger.js');

class RssDatabase {
    constructor() {
        this.db = admin.firestore();
        this.collectionName = 'rss_status';
    }

    /**
     * URLをハッシュ化してドキュメントIDにする
     * @param {string} url URL
     * @returns {string} ハッシュ化されたID
     */
    getSafeDocumentId(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    /**
     * 日付を標準化する
     * @param {string|Date} dateStr 日付文字列またはDateオブジェクト
     * @returns {Date|null} 標準化された日付
     */
    parseDate(dateStr) {
        if (!dateStr) return null;

        try {
            if (typeof dateStr === 'string') {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    logger.warn(`無効な日付文字列: ${dateStr}`);
                    return null;
                }
                return date;
            }

            if (dateStr instanceof Date) {
                if (isNaN(dateStr.getTime())) {
                    logger.warn(`無効なDateオブジェクト`);
                    return null;
                }
                return dateStr;
            }

            if (dateStr._seconds !== undefined) {
                return new Date(dateStr._seconds * 1000);
            }

            logger.warn(`サポートされていない日付形式: ${typeof dateStr}`);
            return null;
        } catch (e) {
            logger.error(`日付処理エラー: ${e.message}`);
            return null;
        }
    }

    /**
     * RSSステータスを更新する
     * @param {string} feedUrl フィードURL
     * @param {string} lastItemId 最後に処理したアイテムID
     * @param {string|Date} lastPublishDate 最後に処理したアイテムの公開日
     * @param {string} lastTitle 最後に処理したアイテムのタイトル
     * @returns {Promise<boolean>} 成功したかどうか
     */
    async updateRssStatus(feedUrl, lastItemId, lastPublishDate, lastTitle) {
        if (!feedUrl) {
            logger.error("更新エラー: フィードURLが指定されていません");
            return false;
        }

        try {
            const docId = this.getSafeDocumentId(feedUrl);
            const parsedDate = this.parseDate(lastPublishDate);

            const data = {
                feedUrl,
                lastItemId: lastItemId || null,
                lastPublishDate: parsedDate,
                lastTitle: lastTitle || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = this.db.collection(this.collectionName).doc(docId);
            const doc = await docRef.get();

            if (doc.exists) {
                await docRef.update(data);
            } else {
                data.createdAt = admin.firestore.FieldValue.serverTimestamp();
                await docRef.set(data);
            }

            logger.info(`RSS ${feedUrl} のステータスを更新しました`);
            return true;
        } catch (error) {
            logger.error(`RSSステータス更新エラー (${feedUrl}): ${error.message}`);
            throw error;
        }
    }

    /**
     * フィードURLからRSSステータスを取得する
     * @param {string} feedUrl フィードURL
     * @returns {Promise<Object|null>} RSSステータスまたはnull
     */
    async getRssStatus(feedUrl) {
        if (!feedUrl) {
            logger.error("取得エラー: フィードURLが指定されていません");
            return null;
        }

        try {
            const docId = this.getSafeDocumentId(feedUrl);
            const docRef = this.db.collection(this.collectionName).doc(docId);
            const doc = await docRef.get();

            if (doc.exists) {
                const data = doc.data();
                let lastPublishDate = this.parseDate(data.lastPublishDate);

                return {
                    lastItemId: data.lastItemId || null,
                    lastPublishDate,
                    lastTitle: data.lastTitle || null
                };
            }
            return null;
        } catch (error) {
            logger.error(`RSSステータス取得エラー (${feedUrl}): ${error.message}`);
            return null;
        }
    }

    /**
     * すべてのRSSステータスを取得する
     * @returns {Promise<Object>} {feedUrl: statusObject}形式のオブジェクト
     */
    async getAllRssStatus() {
        try {
            const snapshot = await this.db.collection(this.collectionName).get();
            const statusObj = {};
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.feedUrl) {
                    statusObj[data.feedUrl] = {
                        lastItemId: data.lastItemId || null,
                        lastPublishDate: data.lastPublishDate,
                        lastTitle: data.lastTitle || null
                    };
                }
            });

            return statusObj;
        } catch (error) {
            logger.error(`全RSSステータス取得エラー: ${error.message}`);
            return {};
        }
    }
}

module.exports = RssDatabase;