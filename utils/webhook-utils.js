// utils/webhook-utils.js
const logger = require('./logger.js');

// Webhookをキャッシュするマップ
const webhookCache = new Map();

/**
 * チャンネル内のWebhookを取得する
 * @param {Channel} channel - Webhookを取得するチャンネル
 * @returns {Promise<Webhook|null>} 取得したWebhook
 */
async function getWebhookInChannel(channel) {
    try {
        // キャッシュから取得を試みる
        if (webhookCache.has(channel.id)) {
            return webhookCache.get(channel.id);
        }

        let targetChannel = channel;
        let webhook = null;
        
        // スレッドの場合は親チャンネルを使用
        if (channel.isThread() && channel.parent) {
            targetChannel = channel.parent;
        }
        
        // チャンネルのWebhookを取得
        const webhooks = await targetChannel.fetchWebhooks();
        webhook = webhooks.find(wh => wh.token) || await targetChannel.createWebhook({
            name: "RSSBot"
        });
        
        // キャッシュに保存
        if (webhook) {
            webhookCache.set(channel.id, webhook);
        }
        
        return webhook;
    } catch (error) {
        logger.error(`Webhookの取得に失敗しました (${channel.id}):`, error);
        return null;
    }
}

module.exports = {
    getWebhookInChannel
};