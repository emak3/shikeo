// webserver.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config/config.js');
const Database = require('./utils/database.js');
const logger = require('./utils/logger.js');

class WebServer {
    constructor(bot = null) {
        this.app = express();
        this.port = config.webServer?.port || process.env.WEB_PORT || 3000;
        this.host = config.webServer?.host || process.env.WEB_HOST || '0.0.0.0';
        this.bot = bot;
        this.database = new Database();
        this.startTime = new Date();
        this.server = null;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // JSONパース
        this.app.use(express.json());
        
        // 静的ファイル配信
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // ログ出力
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    setupRoutes() {
        // メインページ（静的HTMLファイルを配信）
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // ヘルスチェック
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
                timestamp: new Date().toISOString(),
                discord: this.bot?.client?.isReady() || false
            });
        });

        // API: ボットステータス
        this.app.get('/api/status', async (req, res) => {
            try {
                const stats = await this.database.getStats();
                
                res.json({
                    bot: {
                        online: this.bot?.client?.isReady() || false,
                        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
                        username: this.bot?.client?.user?.tag || 'Unknown'
                    },
                    scheduler: {
                        mode: config.scheduler.mode,
                        pattern: config.scheduler.mode === 'cron' ? config.getCronPattern() : null,
                        interval: config.scheduler.mode === 'interval' ? config.scheduler.checkInterval : null
                    },
                    streamers: config.streamers.length,
                    rss: {
                        enabled: config.rss?.enabled || false,
                        feeds: config.rss?.feeds?.length || 0
                    },
                    stats
                });
            } catch (error) {
                logger.error('ステータスAPI エラー:', error);
                res.status(500).json({ error: 'Failed to get status' });
            }
        });

        // API: 配信者一覧
        this.app.get('/api/streamers', (req, res) => {
            const streamers = config.streamers.map(s => ({
                name: s.name,
                platform: s.platform,
                channelId: s.channelId,
                hasRole: !!s.mentionRole
            }));
            res.json(streamers);
        });

        // API: RSS設定
        this.app.get('/api/rss', (req, res) => {
            if (!config.rss?.enabled) {
                return res.json({ enabled: false, feeds: [] });
            }

            const feeds = config.rss.feeds.map(f => ({
                name: f.name,
                url: f.url,
                enabled: f.enabled !== false,
                channels: f.channels.length
            }));

            res.json({
                enabled: true,
                intervalMinutes: config.rss.intervalMinutes,
                feeds
            });
        });

        // API: ログ取得
        this.app.get('/api/logs', (req, res) => {
            try {
                const logStats = logger.getLogStats();
                
                if (!logStats.exists) {
                    return res.json({ error: 'ログファイルが見つかりません' });
                }

                // 最新の50行を取得
                const logContent = fs.readFileSync(logger.logFile, 'utf8');
                const lines = logContent.split('\n').filter(line => line.trim());
                const recentLines = lines.slice(-50);

                res.json({
                    stats: logStats,
                    recentLines: recentLines.reverse() // 新しい順に
                });
            } catch (error) {
                logger.error('ログ取得エラー:', error);
                res.status(500).json({ error: 'ログの取得に失敗しました' });
            }
        });

        // 404エラー
        this.app.use((req, res) => {
            res.status(404).json({ 
                error: 'Not Found',
                message: 'The requested resource was not found.' 
            });
        });
    }

    start() {
        this.server = this.app.listen(this.port, this.host, () => {
            logger.info(`🌐 Webサーバーが起動しました: http://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                logger.info('Webサーバーを停止しました');
            });
        }
    }
}

module.exports = WebServer;