// handlers/StickyMessageHandler.js
const Database = require('../utils/database.js');
const logger = require('../utils/logger.js');

class StickyMessageHandler {
    constructor(client, stickyConfig) {
        this.client = client;
        this.stickyConfig = stickyConfig;
        this.database = new Database();
        this.isProcessing = new Set(); // 処理中のチャンネルを追跡
        this.pendingTimeouts = new Map(); // 保留中のタイムアウトを追跡
    }

    /**
     * スティッキーメッセージ機能を初期化
     */
    initialize() {
        if (!this.stickyConfig?.enabled) {
            logger.info('スティッキーメッセージ機能は無効です');
            return;
        }

        if (!this.stickyConfig.channels || this.stickyConfig.channels.length === 0) {
            logger.info('スティッキーメッセージのチャンネルが設定されていません');
            return;
        }

        // 有効なチャンネル設定をフィルタリング
        const enabledChannels = this.stickyConfig.channels.filter(ch => ch.enabled !== false);
        
        if (enabledChannels.length === 0) {
            logger.info('有効なスティッキーメッセージチャンネルがありません');
            return;
        }

        logger.info(`スティッキーメッセージ機能を初期化しました (${enabledChannels.length}チャンネル)`);
    }

    /**
     * メッセージ送信イベントを処理
     * @param {Message} message - 送信されたメッセージ
     */
    async handleMessage(message) {
        try {
            // ボット自身のメッセージは無視
            if (message.author.bot) return;

            // 設定されたチャンネルかどうかチェック
            const channelConfig = this.getChannelConfig(message.channel.id);
            if (!channelConfig) return;

            // 処理中のチャンネルは重複処理を避ける
            if (this.isProcessing.has(message.channel.id)) {
                logger.debug(`チャンネル ${message.channel.id} は既に処理中です`);
                return;
            }

            // 既存の保留中タイムアウトをクリア
            this.clearPendingTimeout(message.channel.id);

            // 遅延後にスティッキーメッセージを送信
            const timeout = setTimeout(async () => {
                await this.sendStickyMessage(message.channel, channelConfig);
                this.pendingTimeouts.delete(message.channel.id);
            }, channelConfig.delay || 2000);

            this.pendingTimeouts.set(message.channel.id, timeout);

        } catch (error) {
            logger.error('スティッキーメッセージ処理エラー:', error);
        }
    }

    /**
     * チャンネル設定を取得
     * @param {string} channelId - チャンネルID
     * @returns {Object|null} チャンネル設定
     */
    getChannelConfig(channelId) {
        if (!this.stickyConfig?.channels) return null;

        return this.stickyConfig.channels.find(config => 
            config.channelId === channelId && config.enabled !== false
        );
    }

    /**
     * 保留中のタイムアウトをクリア
     * @param {string} channelId - チャンネルID
     */
    clearPendingTimeout(channelId) {
        const existingTimeout = this.pendingTimeouts.get(channelId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            this.pendingTimeouts.delete(channelId);
        }
    }

    /**
     * スティッキーメッセージを送信
     * @param {Channel} channel - 対象チャンネル
     * @param {Object} config - チャンネル設定
     */
    async sendStickyMessage(channel, config) {
        this.isProcessing.add(channel.id);

        try {
            // 前回のスティッキーメッセージを削除
            await this.deletePreviousStickyMessage(channel.id);

            // 新しいスティッキーメッセージを送信
            const messageOptions = {
                content: config.message
            };

            // webhookを使用する場合の設定
            if (config.username || config.avatarURL) {
                const webhook = await this.getOrCreateWebhook(channel, config.username);
                if (webhook) {
                    const webhookOptions = {
                        content: config.message
                    };

                    if (config.username) {
                        webhookOptions.username = config.username;
                    }

                    if (config.avatarURL) {
                        webhookOptions.avatarURL = config.avatarURL;
                    }

                    const sentMessage = await webhook.send(webhookOptions);
                    await this.saveStickyMessageId(channel.id, sentMessage.id);
                    
                    logger.info(`スティッキーメッセージを送信しました (Webhook): ${channel.name || channel.id}`);
                    return;
                }
            }

            // 通常のメッセージ送信
            const sentMessage = await channel.send(messageOptions);
            await this.saveStickyMessageId(channel.id, sentMessage.id);

            logger.info(`スティッキーメッセージを送信しました: ${channel.name || channel.id}`);

        } catch (error) {
            logger.error(`スティッキーメッセージ送信エラー (${channel.id}):`, error);
        } finally {
            this.isProcessing.delete(channel.id);
        }
    }

    /**
     * 前回のスティッキーメッセージを削除
     * @param {string} channelId - チャンネルID
     */
    async deletePreviousStickyMessage(channelId) {
        try {
            const previousMessageId = await this.getStickyMessageId(channelId);
            
            if (!previousMessageId) return;

            const channel = await this.client.channels.fetch(channelId);
            if (!channel) return;

            const previousMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
            
            if (previousMessage) {
                await previousMessage.delete();
                logger.debug(`前回のスティッキーメッセージを削除しました: ${previousMessageId}`);
            }

        } catch (error) {
            logger.error(`前回のスティッキーメッセージ削除エラー:`, error);
        }
    }

    /**
     * WebhookまたはBot用のWebhookを取得/作成
     * @param {Channel} channel - 対象チャンネル
     * @param {string} username - Webhook名
     * @returns {Promise<Webhook|null>} Webhook
     */
    async getOrCreateWebhook(channel, username = 'StickyBot') {
        try {
            const webhooks = await channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.name === username && wh.token);

            if (!webhook) {
                webhook = await channel.createWebhook({
                    name: username,
                    reason: 'スティッキーメッセージ機能用'
                });
            }

            return webhook;

        } catch (error) {
            logger.error('Webhook取得/作成エラー:', error);
            return null;
        }
    }

    /**
     * スティッキーメッセージIDをデータベースに保存
     * @param {string} channelId - チャンネルID
     * @param {string} messageId - メッセージID
     */
    async saveStickyMessageId(channelId, messageId) {
        try {
            const db = this.database.db;
            await db.collection('sticky_messages').doc(channelId).set({
                channelId,
                messageId,
                updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            logger.error('スティッキーメッセージID保存エラー:', error);
        }
    }

    /**
     * データベースからスティッキーメッセージIDを取得
     * @param {string} channelId - チャンネルID
     * @returns {Promise<string|null>} メッセージID
     */
    async getStickyMessageId(channelId) {
        try {
            const db = this.database.db;
            const doc = await db.collection('sticky_messages').doc(channelId).get();
            
            if (doc.exists) {
                return doc.data().messageId;
            }

            return null;

        } catch (error) {
            logger.error('スティッキーメッセージID取得エラー:', error);
            return null;
        }
    }

    /**
     * 特定チャンネルのスティッキーメッセージを手動で送信
     * @param {string} channelId - チャンネルID
     */
    async forceSendStickyMessage(channelId) {
        try {
            const channelConfig = this.getChannelConfig(channelId);
            if (!channelConfig) {
                throw new Error('チャンネル設定が見つかりません');
            }

            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                throw new Error('チャンネルが見つかりません');
            }

            await this.sendStickyMessage(channel, channelConfig);
            logger.info(`手動でスティッキーメッセージを送信しました: ${channelId}`);

        } catch (error) {
            logger.error(`手動スティッキーメッセージ送信エラー (${channelId}):`, error);
            throw error;
        }
    }

    /**
     * 特定チャンネルのスティッキーメッセージを削除
     * @param {string} channelId - チャンネルID
     */
    async removeStickyMessage(channelId) {
        try {
            await this.deletePreviousStickyMessage(channelId);
            
            // データベースからも削除
            const db = this.database.db;
            await db.collection('sticky_messages').doc(channelId).delete();
            
            logger.info(`スティッキーメッセージを削除しました: ${channelId}`);

        } catch (error) {
            logger.error(`スティッキーメッセージ削除エラー (${channelId}):`, error);
            throw error;
        }
    }

    /**
     * 全ての保留中タイムアウトをクリア（シャットダウン時用）
     */
    clearAllTimeouts() {
        for (const timeout of this.pendingTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.pendingTimeouts.clear();
        logger.info('すべてのスティッキーメッセージタイムアウトをクリアしました');
    }

    /**
     * 統計情報を取得
     * @returns {Promise<Object>} 統計情報
     */
    async getStats() {
        try {
            const db = this.database.db;
            const snapshot = await db.collection('sticky_messages').get();
            
            const enabledChannels = this.stickyConfig?.channels?.filter(ch => ch.enabled !== false) || [];
            
            return {
                enabled: this.stickyConfig?.enabled || false,
                configuredChannels: enabledChannels.length,
                activeStickyMessages: snapshot.size,
                processingChannels: this.isProcessing.size,
                pendingTimeouts: this.pendingTimeouts.size
            };

        } catch (error) {
            logger.error('スティッキーメッセージ統計取得エラー:', error);
            return {
                enabled: false,
                configuredChannels: 0,
                activeStickyMessages: 0,
                processingChannels: 0,
                pendingTimeouts: 0
            };
        }
    }
}

module.exports = StickyMessageHandler;