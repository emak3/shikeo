// services/RssService.js
const { MessageFlags } = require('discord.js');
const Parser = require('rss-parser');
const cron = require('node-cron');
const RssDatabase = require('./RssDatabase.js');
const { getFavicon } = require('../utils/favicon-utils.js');
const { getWebhookInChannel } = require('../utils/webhook-utils.js');
const { createRssEmbed, safeCompareDate } = require('./FeedFormatter.js');
const logger = require('../utils/logger.js');

class RssService {
    constructor(client) {
        this.client = client;
        this.parser = new Parser({
            customFields: {
                item: [
                    ['media:thumbnail', 'mediaThumbnail'],
                    ['media:content', 'mediaContent'],
                    ['enclosure', 'enclosure'],
                    ['image', 'image']
                ]
            }
        });
        this.rssDatabase = new RssDatabase();
        this.isProcessing = false;
    }

    /**
     * URLからドメインを抽出する
     * @param {string} url URL
     * @returns {string|null} ドメイン
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            return null;
        }
    }

    /**
     * RSSアイテムをWebhookに送信する
     * @param {Webhook} webhook Webhook
     * @param {Object} item RSSアイテム
     * @param {Object} feed フィード情報
     * @param {string} faviconUrl ファビコンURL
     */
    async sendRssToWebhook(webhook, item, feed, faviconUrl) {
        try {
            // Embedを作成
            const container = await createRssEmbed(item, feed);

            // メッセージオプション
            const messageOptions = {
                username: feed.name,
                components: [container],
                flags: MessageFlags.IsComponentsV2
            };

            // アイコンURL設定
            if (faviconUrl) {
                messageOptions.avatarURL = faviconUrl;
            }

            // メッセージ送信
            try {
                await webhook.send(messageOptions);
                logger.info(`RSS送信成功: ${item.title}`);
            } catch (webhookError) {
                logger.error(`Webhook送信エラー: ${webhookError.message}`);

                // avatarURLが問題の場合、それを除いて再試行
                if (messageOptions.avatarURL) {
                    logger.info(`avatarURLを削除して再試行します`);
                    delete messageOptions.avatarURL;
                    await webhook.send(messageOptions);
                    logger.info(`avatarURLなしでの送信成功: ${item.title}`);
                } else {
                    throw webhookError;
                }
            }
        } catch (error) {
            logger.error(`RSS送信エラー: ${error.message}`);

            // エラー時のフォールバック: シンプルなメッセージ
            try {
                await webhook.send({
                    username: feed.name,
                    content: `**${item.title}**\n${item.link || ''}`,
                });
                logger.info(`フォールバック送信成功: ${item.title}`);
            } catch (fallbackError) {
                logger.error(`フォールバック送信エラー: ${fallbackError.message}`);
            }
        }
    }

    /**
     * RSSフィードを処理する
     * @param {Array} rssFeeds RSS設定配列
     */
    async processRssFeeds(rssFeeds) {
        if (this.isProcessing) {
            logger.warn('RSS処理が既に実行中です');
            return;
        }

        this.isProcessing = true;
        logger.info('RSSフィードの処理を開始します');

        try {
            if (!rssFeeds || rssFeeds.length === 0) {
                logger.info('RSSフィードが設定されていません');
                return;
            }

            // 各RSSフィードを処理
            for (const feed of rssFeeds) {
                try {
                    logger.info(`フィード処理: ${feed.name} (${feed.url})`);

                    // RSSフィードを取得
                    const feedData = await this.parser.parseURL(feed.url);
                    logger.debug(`フィード ${feed.url} から ${feedData.items.length}件のアイテムを取得`);

                    // 最後に処理したアイテムの情報を取得
                    const lastProcessed = await this.rssDatabase.getRssStatus(feed.url) || {
                        lastItemId: null,
                        lastPublishDate: null,
                        lastTitle: null
                    };

                    // 新しいアイテムをフィルタリング
                    const newItems = [];

                    for (const item of feedData.items) {
                        let isNew = false;

                        // ID、日付、タイトルによる比較
                        if (item.guid && lastProcessed.lastItemId) {
                            isNew = item.guid !== lastProcessed.lastItemId;
                        } else if (item.pubDate && lastProcessed.lastPublishDate) {
                            isNew = safeCompareDate(item.pubDate, lastProcessed.lastPublishDate);
                        } else if (item.title && lastProcessed.lastTitle) {
                            isNew = item.title !== lastProcessed.lastTitle;
                        } else {
                            isNew = true;
                        }

                        if (isNew) {
                            newItems.push(item);
                        }
                    }

                    // 新しいアイテムを日付順にソート
                    newItems.sort((a, b) => {
                        try {
                            const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                            const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;

                            if (isNaN(dateA) || isNaN(dateB)) {
                                return 0;
                            }

                            return dateA - dateB;
                        } catch (e) {
                            logger.error(`日付ソートエラー: ${e.message}`);
                            return 0;
                        }
                    });

                    logger.info(`フィード ${feed.url} の新しいアイテム数: ${newItems.length}`);

                    // ファビコンを取得
                    const domain = this.extractDomain(feed.url) || this.extractDomain(feedData.link);
                    let faviconUrl = null;

                    if (domain) {
                        try {
                            faviconUrl = await getFavicon(domain);
                            logger.debug(`ファビコン取得成功: ${faviconUrl}`);
                        } catch (faviconError) {
                            logger.error(`ファビコン取得エラー: ${faviconError.message}`);
                        }
                    }

                    // 新しいアイテムをチャンネルに送信
                    for (const item of newItems) {
                        logger.debug(`新しいアイテムを送信: ${item.title}`);

                        // 設定されたすべてのチャンネルに送信
                        for (const channelId of feed.channels) {
                            try {
                                const channel = await this.client.channels.fetch(channelId);
                                if (channel) {
                                    const webhook = await getWebhookInChannel(channel);
                                    if (webhook) {
                                        await this.sendRssToWebhook(webhook, item, feed, faviconUrl);
                                        logger.info(`チャンネル ${channelId} にアイテム "${item.title}" を送信しました`);
                                    } else {
                                        logger.error(`チャンネル ${channelId} のWebhook取得に失敗しました`);
                                    }
                                }
                            } catch (channelError) {
                                logger.error(`チャンネル ${channelId} へのメッセージ送信エラー: ${channelError.message}`);
                            }
                        }
                    }

                    // 最後に処理したアイテムの情報を更新
                    if (newItems.length > 0) {
                        const lastItem = newItems[newItems.length - 1];
                        const lastItemId = lastItem.guid || null;
                        const lastPublishDate = lastItem.pubDate ? new Date(lastItem.pubDate) : null;
                        const lastTitle = lastItem.title || null;

                        try {
                            await this.rssDatabase.updateRssStatus(
                                feed.url,
                                lastItemId,
                                lastPublishDate,
                                lastTitle
                            );
                            logger.info(`フィード ${feed.url} のステータスを更新しました`);
                        } catch (updateError) {
                            logger.error(`フィード ${feed.url} のステータス更新エラー: ${updateError.message}`);
                        }
                    } else {
                        logger.info(`フィード ${feed.url} に新しいアイテムはありませんでした`);
                    }

                } catch (error) {
                    logger.error(`フィード ${feed.name} (${feed.url}) の処理中にエラーが発生しました: ${error.message}`);
                }
            }
        } catch (error) {
            logger.error(`RSSフィード処理中にエラーが発生しました: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 定期実行を開始する
     * @param {Array} rssFeeds RSS設定配列
     */
    startScheduledProcessing(rssFeeds) {
        // 初回実行
        setTimeout(async () => {
            await this.processRssFeeds(rssFeeds);
        }, 5000); // 5秒後に初回実行

        // 定期実行のスケジュール設定 (10分ごと)
        cron.schedule('*/10 * * * *', async () => {
            logger.info('定期実行: RSSフィードを処理します');
            await this.processRssFeeds(rssFeeds);
        });

        logger.info('RSS定期実行が開始されました (10分間隔)');
    }
}

module.exports = RssService;