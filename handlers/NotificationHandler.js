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
  * ロールボタン付きのDiscord通知を送信
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

            // メッセージ内容を作成
            const messageContent = this.createSimpleMessage(content, streamer);

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
                    .setStyle(ButtonStyle.Primary)
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