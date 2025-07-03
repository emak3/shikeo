// main.js
const { Client, GatewayIntentBits, InteractionType } = require('discord.js');
const config = require('./config/config.js');
const YouTubeService = require('./services/YouTubeService.js');
const NotificationHandler = require('./handlers/NotificationHandler.js');
const logger = require('./utils/logger.js');

class StreamerNotificationBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers // ロール操作に必要
            ]
        });

        this.youtubeService = new YouTubeService(config.youtube.apiKey);
        this.notificationHandler = new NotificationHandler(this.client);
        this.checkInterval = null;
    }

    async initialize() {
        try {
            // Discordクライアントの初期化
            await this.setupDiscordEvents();
            await this.client.login(config.discord.token);

            logger.info('ボットが正常に起動しました');
        } catch (error) {
            logger.error('ボットの初期化に失敗しました:', error);
            process.exit(1);
        }
    }

    setupDiscordEvents() {
        this.client.once('ready', async () => {
            logger.info(`${this.client.user.tag} としてログインしました`);
            logger.info('ロールボタン機能が有効です');

            // 定期チェックを開始
            await this.startPeriodicCheck();
        });

        // インタラクション処理
        this.client.on('interactionCreate', async (interaction) => {
            await this.handleInteraction(interaction);
        });

        this.client.on('error', (error) => {
            logger.error('Discordクライアントエラー:', error);
        });

        // 優雅なシャットダウン処理
        process.on('SIGINT', () => {
            logger.info('シャットダウン処理を開始します...');
            this.gracefulShutdown();
        });

        process.on('SIGTERM', () => {
            logger.info('シャットダウン処理を開始します...');
            this.gracefulShutdown();
        });
    }

    /**
     * インタラクション処理
     * @param {Object} interaction - Discordインタラクション
     */
    async handleInteraction(interaction) {
        try {
            // ボタンインタラクションの処理
            if (interaction.type === InteractionType.MessageComponent) {
                // ロールボタンのインタラクション
                if (this.notificationHandler.isRoleToggleInteraction(interaction)) {
                    await this.notificationHandler.handleRoleToggle(interaction);
                    return;
                }
            }

            // 将来的にスラッシュコマンドなどを追加する場合はここに処理を追加
            if (interaction.type === InteractionType.ApplicationCommand) {
                logger.debug(`スラッシュコマンド受信: ${interaction.commandName}`);
            }

        } catch (error) {
            logger.error('インタラクション処理エラー:', error);
            
            // エラーレスポンス
            const errorMessage = 'インタラクション処理中にエラーが発生しました。';
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            } catch (responseError) {
                logger.error('エラーレスポンス送信失敗:', responseError);
            }
        }
    }

    async startPeriodicCheck() {
        // 初回チェック
        await this.checkForNewContent();

        // 定期チェックを設定 (デフォルト: 5分間隔)
        this.checkInterval = setInterval(async () => {
            await this.checkForNewContent();
        }, config.checkInterval || 5 * 60 * 1000);

        logger.info(`定期チェックを開始しました (間隔: ${(config.checkInterval || 5 * 60 * 1000) / 1000}秒)`);
    }

    async checkForNewContent() {
        try {
            logger.info('新しいコンテンツをチェック中...');

            for (const streamer of config.streamers) {
                await this.checkStreamerContent(streamer);
            }

            logger.info('コンテンツチェック完了');
        } catch (error) {
            logger.error('コンテンツチェック中にエラーが発生しました:', error);
        }
    }

    async checkStreamerContent(streamer) {
        try {
            if (streamer.platform === 'youtube') {
                const videos = await this.youtubeService.getLatestVideos(
                    streamer.channelId,
                    config.maxVideosToCheck || 5
                );

                for (const video of videos) {
                    const isNew = await this.notificationHandler.isNewContent(video.id);

                    if (isNew) {
                        await this.notificationHandler.sendNotification(
                            streamer.notificationChannelId,
                            video,
                            streamer
                        );

                        await this.notificationHandler.markAsSent(video.id, streamer.name, streamer.platform);
                        logger.info(`新しい動画を通知しました: ${video.title}`);
                    }
                }
            }
        } catch (error) {
            logger.error(`配信者 ${streamer.name} のコンテンツチェックでエラー:`, error);
        }
    }

    gracefulShutdown() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.client.destroy();
        logger.info('ボットを正常に終了しました');
        process.exit(0);
    }
}

// ボットの起動
const bot = new StreamerNotificationBot();
bot.initialize().catch((error) => {
    logger.error('ボットの起動に失敗しました:', error);
    process.exit(1);
});

module.exports = StreamerNotificationBot;