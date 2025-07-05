// main.js
const { Client, GatewayIntentBits, InteractionType } = require('discord.js');
const cron = require('node-cron');
const config = require('./config/config.js');
const YouTubeService = require('./services/YouTubeService.js');
const NotificationHandler = require('./handlers/NotificationHandler.js');
const StickyMessageHandler = require('./handlers/StickyMessageHandler.js');
const RssService = require('./services/RssService.js');
const WebServer = require('./webserver.js');
const logger = require('./utils/logger.js');

class StreamerNotificationBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.youtubeService = new YouTubeService(config.youtube.apiKey);
        this.notificationHandler = new NotificationHandler(this.client);
        this.stickyMessageHandler = new StickyMessageHandler(this.client, config.stickyMessages);
        this.rssService = new RssService(this.client);
        this.webServer = config.webServer?.enabled !== false ? new WebServer(this) : null;
        this.checkInterval = null;
        this.cronTask = null;
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
            logger.info('配信状態変化検出機能が有効です');

            // スティッキーメッセージ機能を初期化
            this.stickyMessageHandler.initialize();

            // Webサーバーを開始（設定で有効で、インスタンスが存在する場合のみ）
            if (this.webServer) {
                this.webServer.start();
            }

            // 配信者チェックを開始
            await this.startPeriodicCheck();

            // RSS機能を開始
            await this.startRssService();
        });

        // メッセージイベントリスナーを追加
        this.client.on('messageCreate', async (message) => {
            try {
                // スティッキーメッセージ処理
                if (this.stickyMessageHandler) {
                    await this.stickyMessageHandler.handleMessage(message);
                }
            } catch (error) {
                logger.error('メッセージ処理エラー:', error);
            }
        });

        // インタラクション処理
        this.client.on('interactionCreate', async (interaction) => {
            await this.handleInteraction(interaction);
        });

        // 既存のエラー処理とシャットダウン処理はそのまま
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
     * RSS機能を開始する
     */
    async startRssService() {
        try {
            // RSS設定をチェック
            if (!config.rss || !config.rss.enabled || !config.rss.feeds || config.rss.feeds.length === 0) {
                logger.info('RSS機能は無効になっています');
                return;
            }

            // 有効なRSSフィードをフィルタリング
            const enabledFeeds = config.rss.feeds.filter(feed => feed.enabled !== false);

            if (enabledFeeds.length === 0) {
                logger.info('有効なRSSフィードが設定されていません');
                return;
            }

            // RSS処理を開始
            this.rssService.startScheduledProcessing(enabledFeeds);
            logger.info(`RSS機能を開始しました (${enabledFeeds.length}個のフィード)`);
        } catch (error) {
            logger.error('RSS機能の開始に失敗しました:', error);
        }
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

    /**
     * 定期チェックを開始
     */
    async startPeriodicCheck() {
        // 初回チェック（5秒後に実行）
        setTimeout(async () => {
            await this.checkForNewContent();
        }, 5000);

        const schedulerMode = config.scheduler.mode;

        if (schedulerMode === 'cron') {
            await this.startCronSchedule();
        } else {
            await this.startIntervalSchedule();
        }
    }

    /**
     * cronスケジュールを開始
     */
    async startCronSchedule() {
        try {
            const cronPattern = config.getCronPattern();

            // cronパターンが有効かチェック
            if (!cron.validate(cronPattern)) {
                throw new Error(`無効なcronパターンです: ${cronPattern}`);
            }

            this.cronTask = cron.schedule(cronPattern, async () => {
                const now = new Date();
                logger.info(`定期実行開始 (cron: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')})`);
                await this.checkForNewContent();
            }, {
                scheduled: true,
                timezone: "Asia/Tokyo"
            });

            // 次回実行時刻を計算して表示
            const nextRun = this.getNextCronRun(cronPattern);
            logger.info(`cronスケジュールを開始しました (パターン: ${cronPattern})`);
            logger.info(`次回実行予定: ${nextRun.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

        } catch (error) {
            logger.error('cronスケジュール開始エラー:', error);
            logger.info('フォールバックとして定期実行モードを使用します');
            await this.startIntervalSchedule();
        }
    }

    /**
     * intervalスケジュールを開始
     */
    async startIntervalSchedule() {
        const interval = config.scheduler.checkInterval || 5 * 60 * 1000;

        this.checkInterval = setInterval(async () => {
            await this.checkForNewContent();
        }, interval);

        logger.info(`定期チェックを開始しました (間隔: ${interval / 1000}秒)`);
    }

    /**
     * cronパターンから次回実行時刻を計算
     * @param {string} cronPattern - cronパターン
     * @returns {Date} 次回実行時刻
     */
    getNextCronRun(cronPattern) {
        try {
            const parts = cronPattern.split(' ');
            if (parts.length < 5) return new Date();

            const minutes = parts[0];
            const now = new Date();
            const nextRun = new Date(now);

            // 分の部分を解析
            if (minutes.includes(',')) {
                // 複数分指定の場合
                const minuteList = minutes.split(',').map(m => parseInt(m.trim()));
                const currentMinute = now.getMinutes();

                let nextMinute = minuteList.find(m => m > currentMinute);
                if (nextMinute === undefined) {
                    // 次の時間の最初の分
                    nextMinute = minuteList[0];
                    nextRun.setHours(nextRun.getHours() + 1);
                }

                nextRun.setMinutes(nextMinute);
                nextRun.setSeconds(0);
                nextRun.setMilliseconds(0);
            } else if (minutes === '*') {
                // 毎分実行の場合
                nextRun.setMinutes(nextRun.getMinutes() + 1);
                nextRun.setSeconds(0);
                nextRun.setMilliseconds(0);
            } else {
                // 単一分指定の場合
                const targetMinute = parseInt(minutes);
                if (now.getMinutes() >= targetMinute) {
                    nextRun.setHours(nextRun.getHours() + 1);
                }
                nextRun.setMinutes(targetMinute);
                nextRun.setSeconds(0);
                nextRun.setMilliseconds(0);
            }

            return nextRun;
        } catch (error) {
            logger.error('次回実行時刻計算エラー:', error);
            return new Date(Date.now() + 60000); // 1分後をデフォルトとする
        }
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
                    // 通知すべきかチェック（状態変化も考慮）
                    const notificationCheck = await this.notificationHandler.shouldNotify(video.id, video);

                    if (notificationCheck.shouldNotify) {
                        // 通知を送信
                        await this.notificationHandler.sendNotification(
                            streamer.notificationChannelId,
                            video,
                            streamer,
                            notificationCheck.notificationType
                        );

                        // 送信済みとしてマーク
                        await this.notificationHandler.markAsSent(
                            video.id,
                            streamer.name,
                            streamer.platform,
                            video,
                            notificationCheck.notificationType
                        );

                        // ログメッセージを作成
                        let logMessage = `新しい動画を通知しました: ${video.title}`;
                        if (notificationCheck.notificationType === 'status_change') {
                            logMessage = `配信状態変化を通知しました: ${video.title} (配信予定 → ライブ配信開始)`;
                        }

                        logger.info(logMessage);
                    } else {
                        // 通知しない場合のデバッグログ
                        if (notificationCheck.statusChanged) {
                            logger.debug(`状態変化を検出しましたが通知しません: ${video.title} (${notificationCheck.notificationType})`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error(`配信者 ${streamer.name} のコンテンツチェックでエラー:`, error);
        }
    }

    gracefulShutdown() {
        // intervalタイマーを停止
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            logger.info('定期実行タイマーを停止しました');
        }

        // cronタスクを停止
        if (this.cronTask) {
            this.cronTask.stop();
            logger.info('cronタスクを停止しました');
        }

        // スティッキーメッセージのタイムアウトをクリア
        if (this.stickyMessageHandler) {
            this.stickyMessageHandler.clearAllTimeouts();
        }

        // Webサーバーを停止
        if (this.webServer) {
            this.webServer.stop();
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