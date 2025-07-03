// handlers/NotificationHandler.js
const {
    ContainerBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} = require('discord.js');
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
     * Display Componentsを使用したDiscord通知を送信
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

            const container = this.createDisplayComponents(content, streamer);
            const messageContent = this.createMentionMessage(streamer);

            const messageData = {
                content: messageContent,
                components: [container],
                flags: MessageFlags.IsComponentsV2
            };

            await channel.send(messageData);

            logger.info(`通知を送信しました: ${content.title} (チャンネル: ${channel.name})`);

        } catch (error) {
            logger.error('Discord通知送信エラー:', error);
            throw error;
        }
    }

    /**
     * Display Componentsコンテナを作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {ContainerBuilder} Display Components コンテナ
     */
    createDisplayComponents(content, streamer) {
        const container = new ContainerBuilder()
            .addSectionComponents(
                section => section
                    .addTextDisplayComponents(
                        textDisplay => textDisplay
                            .setContent(this.getContentTypeHeader(content)),
                        textDisplay => textDisplay
                            .setContent(`##${content.title}`),
                        textDisplay => textDisplay
                            .setContent(`📺 ${streamer.name}`)
                    )
                    .setThumbnailAccessory(
                        thumbnail => thumbnail
                            .setURL(this.getChannelThumbnail(streamer))
                    )
            );

        // 説明文を追加
        if (content.description) {
            const shortDescription = this.formatDescription(content.description);
            container.addSeparatorComponents(separator => separator);
            container.addTextDisplayComponents(
                textDisplay => textDisplay
                    .setContent('### 📝 概要欄'),
                textDisplay => textDisplay
                    .setContent(shortDescription)
            );
        }

        // サムネイル画像を追加
        if (content.thumbnailUrl) {
            container.addSeparatorComponents(separator => separator);

            const mediaGallery = new MediaGalleryBuilder()
                .addItems(
                    new MediaGalleryItemBuilder()
                        .setURL(content.thumbnailUrl)
                );

            container.addMediaGalleryComponents(mediaGallery);
        }

        // 動画情報セクション
        container.addSeparatorComponents(separator => separator);
        container.addTextDisplayComponents(
            textDisplay => textDisplay
                .setContent('### 📊 動画情報'),
            textDisplay => textDisplay
                .setContent(this.createVideoInfoText(content))
        );

        // アクションボタンセクション
        container.addSeparatorComponents(separator => separator);
        container.addSectionComponents(
            section => section
                .addTextDisplayComponents(
                    textDisplay => textDisplay
                        .setContent(`📅 投稿日時: ${this.formatDate(content.publishedAt)}\n-# 右のボタンから動画を視聴できます`)
                )
                .setButtonAccessory(
                    button => button
                        .setLabel(content.isLive ? '🔴 ライブを見る' : '🎬 動画を見る')
                        .setStyle(ButtonStyle.Link)
                        .setURL(content.url)
                )
        );

        // 追加アクションボタン（通知設定など）
        if (content.isLive || content.isUpcoming) {
            container.addSectionComponents(
                section => section
                    .addTextDisplayComponents(
                        textDisplay => textDisplay
                            .setContent(content.isLive ? '🔴 現在ライブ配信中です' : '⏰ まもなく配信開始予定です')
                    )
            );
        }

        return container;
    }

    /**
     * メンション付きメッセージ内容を作成
     * @param {Object} streamer - 配信者情報
     * @returns {string} メッセージ内容
     */
    createMentionMessage(streamer) {
        let message = '';

        // ロールメンション
        if (streamer.mentionRole) {
            message += `<@&${streamer.mentionRole}> `;
        }

        return message;
    }

    /**
     * コンテンツタイプのヘッダーを取得
     * @param {Object} content - コンテンツ情報
     * @returns {string} ヘッダーテキスト
     */
    getContentTypeHeader(content) {
        if (content.isLive) {
            return '**🔴 ライブ配信開始**';
        } else if (content.isUpcoming) {
            return '**⏰ 配信予定**';
        } else {
            return '**🎬 新しい動画**';
        }
    }

    /**
     * チャンネルサムネイルURLを取得
     * @param {Object} streamer - 配信者情報
     * @returns {string} サムネイルURL
     */
    getChannelThumbnail(streamer) {
        // YouTubeチャンネルのデフォルトアバター
        return `https://yt3.ggpht.com/a/default-user=s240-c-k-c0x00ffffff-no-rj`;
    }

    /**
     * 説明文をフォーマット
     * @param {string} description - 元の説明文
     * @returns {string} フォーマット済み説明文
     */
    formatDescription(description) {
        if (!description) return '';

        const maxLength = 200;
        if (description.length > maxLength) {
            return description.substring(0, maxLength) + '...';
        }
        return description;
    }

    /**
     * 動画情報テキストを作成
     * @param {Object} content - コンテンツ情報
     * @returns {string} 動画情報テキスト
     */
    createVideoInfoText(content) {
        const info = [];

        if (content.duration && !content.isLive && !content.isUpcoming) {
            info.push(`⏱️ 再生時間: ${content.duration}`);
        }

        if (content.viewCount > 0) {
            info.push(`👀 再生回数: ${this.formatNumber(content.viewCount)}回`);
        }

        if (content.isLive) {
            info.push('🔴 ライブ配信中');
        } else if (content.isUpcoming) {
            info.push('⏰ 配信予定');
        }

        return info.join(' • ') || '新しい動画が投稿されました';
    }

    /**
     * 日付をフォーマット
     * @param {string} dateString - 日付文字列
     * @returns {string} フォーマット済み日付
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
    }

    /**
     * 数値をフォーマット (例: 1234 -> 1.2K)
     * @param {number} num - フォーマットする数値
     * @returns {string} フォーマット済み数値
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toString();
        }
    }

    /**
     * 従来のコンポーネント形式での通知送信（フォールバック用）
     * @param {string} channelId - 通知先チャンネルID
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {Promise<void>}
     */
    async sendLegacyNotification(channelId, content, streamer) {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (!channel) {
                logger.error(`チャンネル ${channelId} が見つかりませんでした`);
                return;
            }

            // 従来のActionRow形式のボタン
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(content.isLive ? '🔴 ライブを見る' : '🎬 動画を見る')
                        .setStyle(ButtonStyle.Link)
                        .setURL(content.url),
                    new ButtonBuilder()
                        .setLabel(`📺 ${streamer.name}のチャンネル`)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.youtube.com/channel/${streamer.channelId}`)
                );

            const messageContent = this.createLegacyMessageContent(content, streamer);

            await channel.send({
                content: messageContent,
                components: [row]
            });

            logger.info(`従来形式の通知を送信しました: ${content.title} (チャンネル: ${channel.name})`);

        } catch (error) {
            logger.error('従来形式のDiscord通知送信エラー:', error);
            throw error;
        }
    }

    /**
     * 従来形式のメッセージ内容を作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {string} メッセージ内容
     */
    createLegacyMessageContent(content, streamer) {
        let message = '';

        // ロールメンション
        if (streamer.mentionRole) {
            message += `<@&${streamer.mentionRole}> `;
        }

        // カスタムメッセージまたはデフォルトメッセージ
        if (streamer.customMessage) {
            message += streamer.customMessage
                .replace('{streamerName}', streamer.name)
                .replace('{contentTitle}', content.title)
                .replace('{contentUrl}', content.url);
        } else {
            // デフォルトメッセージ
            if (content.isLive) {
                message += `🔴 **${streamer.name}** がライブ配信を開始しました！`;
            } else if (content.isUpcoming) {
                message += `⏰ **${streamer.name}** の配信がまもなく開始されます！`;
            } else {
                message += `🎬 **${streamer.name}** の新しい動画がアップロードされました！`;
            }
        }

        // 動画タイトルを追加
        message += `\n\n**${content.title}**`;

        // 説明文を追加（短縮版）
        if (content.description) {
            const shortDescription = this.formatDescription(content.description);
            message += `\n${shortDescription}`;
        }

        // 投稿日時を追加
        message += `\n\n📅 投稿日時: ${this.formatDate(content.publishedAt)}`;

        // サムネイル画像を追加
        if (content.thumbnailUrl) {
            message += `\n${content.thumbnailUrl}`;
        }

        return message;
    }
}

module.exports = NotificationHandler;