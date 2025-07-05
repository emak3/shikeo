// handlers/NotificationHandler.js
const Database = require('../utils/database.js');
const logger = require('../utils/logger.js');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

class NotificationHandler {
    constructor(client) {
        this.client = client;
        this.database = new Database();
    }

    /**
     * 動画の状態を判定
     * @param {Object} video - 動画情報
     * @returns {string} 状態 ('upcoming', 'live', 'video')
     */
    getVideoStatus(video) {
        if (video.isLive) return 'live';
        if (video.isUpcoming) return 'upcoming';
        return 'video';
    }

    /**
     * コンテンツが通知すべきかチェック（状態変化も考慮）
     * @param {string} contentId - コンテンツID
     * @param {Object} video - 動画情報
     * @returns {Promise<{shouldNotify: boolean, notificationType: string, statusChanged: boolean}>}
     */
    async shouldNotify(contentId, video) {
        try {
            const currentStatus = this.getVideoStatus(video);

            // 新しいチェックメソッドを使用
            const checkResult = await this.database.checkNotificationStatus(contentId, currentStatus);

            // 動画状態を更新
            await this.database.updateVideoStatus(contentId, currentStatus, {
                title: video.title,
                streamerName: '', // 後で設定される
                platform: 'youtube'
            });

            return {
                shouldNotify: checkResult.shouldNotify,
                notificationType: checkResult.notificationType,
                statusChanged: checkResult.statusChanged,
                previousStatus: checkResult.previousStatus
            };

        } catch (error) {
            logger.error('通知判定チェックエラー:', error);
            return { shouldNotify: false, notificationType: 'initial', statusChanged: false };
        }
    }

    /**
     * 送信済みとしてマーク（状態変化の場合は別ドキュメントIDで記録）
     * @param {string} contentId - コンテンツID
     * @param {string} streamerName - 配信者名
     * @param {string} platform - プラットフォーム
     * @param {Object} video - 動画情報
     * @param {string} notificationType - 通知タイプ
     * @returns {Promise<void>}
     */
    async markAsSent(contentId, streamerName = '', platform = '', video = {}, notificationType = 'initial') {
        try {
            const status = this.getVideoStatus(video);

            // 通知タイプに応じてドキュメントIDを決定
            let docId = contentId;
            if (notificationType === 'status_change') {
                docId = `${contentId}_live_status_change`;
            }

            await this.database.markAsSent(docId, streamerName, platform, status, notificationType);

            logger.debug(`送信済みマーク: ${docId} (${notificationType})`);

        } catch (error) {
            logger.error('送信済みマークエラー:', error);
        }
    }

    /**
  * ロールボタン付きのDiscord通知を送信
  * @param {string} channelId - 通知先チャンネルID
  * @param {Object} content - コンテンツ情報
  * @param {Object} streamer - 配信者情報
  * @param {string} notificationType - 通知タイプ ('initial', 'status_change')
  * @returns {Promise<void>}
  */
    async sendNotification(channelId, content, streamer, notificationType = 'initial') {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (!channel) {
                logger.error(`チャンネル ${channelId} が見つかりませんでした`);
                return;
            }

            // メッセージ内容を作成
            const messageContent = this.createMessage(content, streamer, notificationType);

            // ボタンを作成
            const components = this.createRoleButton(streamer);

            const messageData = {
                content: messageContent
            };

            // ロールボタンがある場合のみ追加
            if (components.length > 0) {
                messageData.components = components;
            }

            await channel.send(messageData);

            const notificationTypeText = notificationType === 'status_change' ? '(状態変化)' : '';
            logger.info(`通知を送信しました${notificationTypeText}: ${content.title} (チャンネル: ${channel.name})`);

        } catch (error) {
            logger.error('Discord通知送信エラー:', error);
            throw error;
        }
    }

    /**
     * コンテンツタイプのヘッダーを取得
     * @param {Object} content - コンテンツ情報
     * @param {string} notificationType - 通知タイプ
     * @returns {string} ヘッダーテキスト
     */
    getContentTypeHeader(content, notificationType = 'initial') {
        // 状態変化の通知の場合
        if (notificationType === 'status_change') {
            if (content.isLive) {
                return '**🔴 ライブ配信開始** しました！';
            }
        }

        // 初回通知の場合
        if (content.isLive) {
            return '**🔴 ライブ配信開始** しました！';
        } else if (content.isUpcoming) {
            return '**⏰ 配信予定** を立てました。';
        } else {
            return '**🎬 新しい動画** を投稿しました。';
        }
    }

    /**
     * メッセージ内容を作成
     * @param {Object} content - コンテンツ情報
     * @param {Object} streamer - 配信者情報
     * @param {string} notificationType - 通知タイプ
     * @returns {string} メッセージ内容
     */
    createMessage(content, streamer, notificationType = 'initial') {
        let message = '';

        // ロールメンション
        if (streamer.mentionRole) {
            message += `<@&${streamer.mentionRole}>\n`;
        }

        // 状態変化の場合は特別なメッセージ
        if (notificationType === 'status_change') {
            message += `${streamer.name} の配信予定が **🔴 ライブ配信開始** しました！\n`;
        } else {
            message += `${streamer.name} が ${this.getContentTypeHeader(content, notificationType)}\n`;
        }

        // 動画URL
        message += content.url;

        return message;
    }

    /**
     * ロールボタンを作成
     * @param {Object} streamer - 配信者情報
     * @returns {Array} ボタンコンポーネント配列
     */
    createRoleButton(streamer) {
        // メンションロールが設定されていない場合はボタンなし
        if (!streamer.mentionRole) {
            return [];
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`toggle_role_${streamer.mentionRole}`)
                    .setLabel(`🔔 ${streamer.name}通知 ON/OFF`)
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row];
    }

    /**
     * ロールボタンのインタラクションを処理
     * @param {Object} interaction - Discordインタラクション
     * @returns {Promise<void>}
     */
    async handleRoleToggle(interaction) {
        try {
            // カスタムIDからロールIDを取得
            const roleId = interaction.customId.replace('toggle_role_', '');

            const guild = interaction.guild;
            const member = interaction.member;
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: '❌ ロールが見つかりませんでした。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // ユーザーが既にロールを持っているかチェック
            const hasRole = member.roles.cache.has(roleId);

            if (hasRole) {
                // ロールを削除
                await member.roles.remove(role);
                await interaction.reply({
                    content: `🔕 **${role.name}** の通知を無効にしました。`,
                    flags: MessageFlags.Ephemeral
                });
                logger.info(`ロール削除: ${member.user.tag} から ${role.name} を削除`);
            } else {
                // ロールを付与
                await member.roles.add(role);
                await interaction.reply({
                    content: `🔔 **${role.name}** の通知を有効にしました！`,
                    flags: MessageFlags.Ephemeral
                });
                logger.info(`ロール付与: ${member.user.tag} に ${role.name} を付与`);
            }

        } catch (error) {
            logger.error('ロールトグル処理エラー:', error);

            // エラーレスポンス
            const errorMessage = error.code === 50013 ?
                '❌ ボットにロールを操作する権限がありません。' :
                '❌ ロールの操作に失敗しました。';

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    /**
     * ロールボタンのインタラクションかどうかを判定
     * @param {Object} interaction - Discordインタラクション
     * @returns {boolean} ロールボタンの場合true
     */
    isRoleToggleInteraction(interaction) {
        return interaction.customId && interaction.customId.startsWith('toggle_role_');
    }
}

module.exports = NotificationHandler;