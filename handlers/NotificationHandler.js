// handlers/NotificationHandler.js
const Database = require('../utils/database.js');
const logger = require('../utils/logger.js');

class NotificationHandler {
    constructor(client) {
        this.client = client;
        this.database = new Database();
    }

    /**
     * コンテンツが新しいかどうかチェック
     * @param {string} contentId - コンテンツID (動画IDなど)
     * @returns {Promise<boolean>} 新しいコンテンツの場合true
     */
    async isNewContent(contentId) {
        try {
            const exists = await this.database.checkIfSent(contentId);
            return !exists;
        } catch (error) {
            logger.error('新規コンテンツチェックエラー:', error);
            return false;
        }
    }

    /**
     * 送信済みとしてマーク
     * @param {string} contentId - コンテンツID
     * @param {string} streamerName - 配信者名
     * @param {string} platform - プラットフォーム
     * @returns {Promise<void>}
     */
    async markAsSent(contentId, streamerName = '', platform = '') {
        try {
            await this.database.markAsSent(contentId, streamerName, platform);
        } catch (error) {
            logger.error('送信済みマークエラー:', error);
        }
    }

    /**
     * シンプルなDiscord通知を送信
     * @param {string} channelId - 通知先チャンネルID
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {Promise<void>}
     */
    async sendNotification(channelId, content, streamer) {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (!channel) {
                logger.error(`チャンネル ${channelId} が見つかりませんでした`);
                return;
            }

            // シンプルなメッセージを作成
            const messageContent = this.createSimpleMessage(content, streamer);

            await channel.send({
                content: messageContent
            });

            logger.info(`通知を送信しました: ${content.title} (チャンネル: ${channel.name})`);

        } catch (error) {
            logger.error('Discord通知送信エラー:', error);
            throw error;
        }
    }

    /**
     * コンテンツタイプのヘッダーを取得
     * @param {Object} content - コンテンツ情報
     * @returns {string} ヘッダーテキスト
     */
    getContentTypeHeader(content) {
        if (content.isLive) {
            return '**🔴 ライブ配信開始** しました。';
        } else if (content.isUpcoming) {
            return '**⏰ 配信予定** を立てました。';
        } else {
            return '**🎬 新しい動画** を投稿しました。';
        }
    }

    /**
     * シンプルなメッセージ内容を作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {string} メッセージ内容
     */
    createSimpleMessage(content, streamer) {
        let message = '';

        // ロールメンション
        if (streamer.mentionRole) {
            message += `<@&${streamer.mentionRole}> `;
        }

        // 動画URL
        message += `${streamer.name} が ${this.getContentTypeHeader(content)}\n`;
        message += content.url;

        return message;
    }
}

module.exports = NotificationHandler;