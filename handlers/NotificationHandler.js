// handlers/NotificationHandler.js
const {
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
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
     * Discord通知を送信
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

            const components = this.createComponents(content, streamer);
            const messageContent = this.createMessageContent(content, streamer);

            await channel.send({
                content: messageContent,
                components: components
            });

            logger.info(`通知を送信しました: ${content.title} (チャンネル: ${channel.name})`);

        } catch (error) {
            logger.error('Discord通知送信エラー:', error);
            throw error;
        }
    }

    /**
     * Discord Components V2を作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {Array<ActionRowBuilder>} Discord Components配列
     */
    createComponents(content, streamer) {
        const components = [];

        // メインの動画/配信ボタン（1行目）
        const mainButtonRow = new ActionRowBuilder();

        const videoButton = new ButtonBuilder()
            .setLabel(content.isLive ? '🔴 ライブを見る' : '🎬 動画を見る')
            .setStyle(ButtonStyle.Link)
            .setURL(content.url);

        const channelUrl = `https://www.youtube.com/channel/${streamer.channelId || 'unknown'}`;
        const channelButton = new ButtonBuilder()
            .setLabel(`📺 ${streamer.name}のチャンネル`)
            .setStyle(ButtonStyle.Link)
            .setURL(channelUrl);

        mainButtonRow.addComponents(videoButton, channelButton);
        components.push(mainButtonRow);

        // 詳細情報ボタン（2行目）- 通常の動画の場合
        if (!content.isLive && !content.isUpcoming && (content.duration || content.viewCount > 0)) {
            const infoButtonRow = new ActionRowBuilder();

            if (content.duration) {
                const durationButton = new ButtonBuilder()
                    .setCustomId('info_duration')
                    .setLabel(`⏱️ ${content.duration}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                infoButtonRow.addComponents(durationButton);
            }

            if (content.viewCount > 0) {
                const viewButton = new ButtonBuilder()
                    .setCustomId('info_views')
                    .setLabel(`👀 ${this.formatNumber(content.viewCount)}回再生`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                infoButtonRow.addComponents(viewButton);
            }

            if (infoButtonRow.components.length > 0) {
                components.push(infoButtonRow);
            }
        }

        // ライブ配信中の場合（2行目）
        if (content.isLive) {
            const liveInfoRow = new ActionRowBuilder();

            const liveStatusButton = new ButtonBuilder()
                .setCustomId('live_status')
                .setLabel('🔴 ライブ配信中')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true);

            const notifyButton = new ButtonBuilder()
                .setCustomId(`notify_${streamer.channelId}`)
                .setLabel('🔔 通知設定')
                .setStyle(ButtonStyle.Secondary);

            liveInfoRow.addComponents(liveStatusButton, notifyButton);
            components.push(liveInfoRow);
        }

        // 配信予定の場合（2行目）
        if (content.isUpcoming) {
            const upcomingRow = new ActionRowBuilder();

            const upcomingButton = new ButtonBuilder()
                .setCustomId('upcoming_status')
                .setLabel('⏰ まもなく配信開始')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const reminderButton = new ButtonBuilder()
                .setCustomId(`reminder_${content.id}`)
                .setLabel('🔔 リマインダー設定')
                .setStyle(ButtonStyle.Secondary);

            upcomingRow.addComponents(upcomingButton, reminderButton);
            components.push(upcomingRow);
        }

        return components;
    }

    /**
     * メッセージ内容を作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @returns {string} メッセージ内容
     */
    createMessageContent(content, streamer) {
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
            const shortDescription = content.description.length > 150
                ? content.description.substring(0, 150) + '...'
                : content.description;
            message += `\n${shortDescription}`;
        }

        // 投稿日時を追加
        const publishDate = new Date(content.publishedAt);
        const formattedDate = publishDate.toLocaleString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        message += `\n\n📅 投稿日時: ${formattedDate}`;

        // サムネイル画像を追加
        if (content.thumbnailUrl) {
            message += `\n${content.thumbnailUrl}`;
        }

        return message;
    }

    /**
     * コンテンツタイプのテキストを取得
     * @param {Object} content - コンテンツ情報
     * @returns {string} コンテンツタイプテキスト
     */
    getContentTypeText(content) {
        if (content.isLive) {
            return 'ライブ配信中';
        } else if (content.isUpcoming) {
            return '配信予定';
        } else {
            return '新しい動画';
        }
    }

    /**
     * プラットフォームのアイコンURLを取得
     * @param {string} platform - プラットフォーム名
     * @returns {string} アイコンURL
     */
    getPlatformIconUrl(platform) {
        const icons = {
            youtube: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32',
            twitch: 'https://www.google.com/s2/favicons?domain=twitch.tv&sz=32'
        };

        return icons[platform] || null;
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

}

module.exports = NotificationHandler;