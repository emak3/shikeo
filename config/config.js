// config/config.js
const fs = require('fs');
const path = require('path');

/**
 * Firebase サービスアカウント設定を取得
 * @returns {Object} Firebase サービスアカウント設定
 */
function getFirebaseServiceAccount() {
    // 方法1: サービスアカウントファイルを使用
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

        if (fs.existsSync(serviceAccountPath)) {
            try {
                return require(serviceAccountPath);
            } catch (error) {
                console.error('Firebaseサービスアカウントファイルの読み込みに失敗しました:', error.message);
            }
        } else {
            console.warn(`Firebaseサービスアカウントファイルが見つかりません: ${serviceAccountPath}`);
            console.warn('環境変数からFirebase設定を読み込みます...');
        }
    }

    // 方法2: 環境変数から設定を読み込み
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        return {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || null,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID || null,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || null
        };
    }

    // どちらの方法でも設定が見つからない場合
    throw new Error('Firebase設定が見つかりません。サービスアカウントファイルまたは環境変数を設定してください。');
}

module.exports = {
    // Discord設定
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID
    },

    // YouTube設定
    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY
    },

    // Firebase設定
    firebase: {
        serviceAccount: getFirebaseServiceAccount(),
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`
    },

    // チェック間隔設定
    scheduler: {
        // 使用する方式: 'interval' または 'cron'
        mode: process.env.SCHEDULER_MODE || 'cron',
        
        // interval方式の場合の間隔 (ミリ秒)
        checkInterval: parseInt(process.env.CHECK_INTERVAL) || 5 * 60 * 1000, // 5分
        
        // cron方式の場合の実行分
        cronMinutes: process.env.CRON_MINUTES ? 
            process.env.CRON_MINUTES.split(',').map(m => parseInt(m.trim())) : 
            [1, 16, 31, 46], // 1分、16分、31分、46分に実行
        
        // cron形式の設定（高度な設定用）
        // cronMinutesよりもこちらが優先される
        cronPattern: process.env.CRON_PATTERN || null
    },

    // 1回のチェックで取得する最大動画数
    maxVideosToCheck: 5,

    // 監視する配信者リスト
    streamers: [
        {
            name: "しけお/CKO-ゲーム実況-",
            platform: "youtube", // youtube, twitch
            channelId: "UCU2-bJN1yP-G4KuXzVipFPA", // YouTubeチャンネルID
            notificationChannelId: "1271897953912750120", // Discord通知チャンネルID
            mentionRole: "1390492864504402042" // メンション対象ロールID (オプション)
        },
        {
            name: "JRA公式チャンネル",
            platform: "youtube", // youtube, twitch
            channelId: "UCj6AKkCWS6FJqf0o5wP45eQ", // YouTubeチャンネルID
            notificationChannelId: "1365691475744260177", // Discord通知チャンネルID
            mentionRole: "" // メンション対象ロールID (オプション)
        },
        // 必要に応じて追加
    ],

    // Twitch設定 (将来の拡張用)
    twitch: {
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET
    },

    // ログ設定
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || './logs/bot.log'
    },

    // Webサーバー設定
    webServer: {
        enabled: process.env.WEB_SERVER_ENABLED !== 'false', // デフォルトで有効
        port: parseInt(process.env.WEB_PORT) || 3000,
        host: process.env.WEB_HOST || '0.0.0.0'
    },

    // ロールボタン設定
    roleButton: {
        // ロールボタンの有効時間（ミリ秒）
        buttonTimeout: 24 * 60 * 60 * 1000,

        // ロール操作を許可するチャンネル（空の場合は全てのチャンネルで許可）
        allowedChannels: [

        ],

        // ロール操作のログを有効にするかどうか
        enableRoleLog: true
    },
    rss: {
        // RSS処理が有効かどうか
        enabled: true,

        // RSS処理間隔（分）
        intervalMinutes: 10,

        // RSSフィード設定
        feeds: [
            //競馬
            {
                name: "Netkeiba 国内最大級の競馬情報サイト",
                url: "https://rss.netkeiba.com/?pid=rss_netkeiba&site=netkeiba",
                channels: ["1365691475744260177"],
                enabled: true
            },
            {
                name: "競馬 - nikkansports.com",
                url: "https://www.nikkansports.com/keiba/atom.xml",
                channels: ["1365691475744260177"],
                enabled: true
            },
            //サッカー
            {
                name: "J1 - nikkansports.com",
                url: "https://www.nikkansports.com/soccer/jleague/j1/atom.xml",
                channels: ["1404049528369184900"],
                enabled: true
            },
            {
                name: "サッカーキング - Yahoo!ニュース",
                url: "https://news.yahoo.co.jp/rss/media/soccerk/all.xml",
                channels: ["1404049528369184900"],
                enabled: true
            },
            //野球
            {
                name: "プロ野球 - nikkansports.com",
                url: "https://www.nikkansports.com/baseball/professional/atom.xml",
                channels: ["1404082803246632990"],
                enabled: true
            },
            {
                name: "Full-Count - Yahoo!ニュース",
                url: "https://news.yahoo.co.jp/rss/media/fullcount/all.xml",
                channels: ["1404082803246632990"],
                enabled: true
            },
            //
        ]
    },
    stickyMessages: {
        // 機能の有効/無効
        enabled: process.env.STICKY_MESSAGES_ENABLED !== 'false', // デフォルトで有効

        // スティッキーメッセージの設定配列
        channels: [
            {
                // 対象チャンネルID
                channelId: "1148562029880299563",
                
                // 固定するメッセージ内容
                message:"- 名前：\n" +
                        "- しけおの好きなところ：\n" +
                        "- やってるゲーム：\n" +
                        "- 一言：",
                
                // メッセージの送信者名（オプション）
                username: "自己紹介テンプレート (自由に変えてOK)",
                
                // アバターURL（オプション）
                avatarURL: null,
                
                // 固定メッセージの遅延（ミリ秒）
                delay: 200, // 0.2秒後に送信
                
                // 有効/無効の個別設定
                enabled: true
            },
            // 複数のチャンネルに設定可能
            // {
            //     channelId: "別のチャンネルID",
            //     message: "別のメッセージ",
            //     enabled: true
            // }
        ]
    },
};

/**
 * cronパターンを生成する
 * @returns {string} cron形式のパターン
 */
function generateCronPattern() {
    const config = module.exports;
    
    // 直接cronPatternが指定されている場合はそれを使用
    if (config.scheduler.cronPattern) {
        return config.scheduler.cronPattern;
    }
    
    // cronMinutesから生成
    if (config.scheduler.cronMinutes && config.scheduler.cronMinutes.length > 0) {
        const minutesStr = config.scheduler.cronMinutes.join(',');
        return `${minutesStr} * * * *`; // 毎時指定分に実行
    }
    
    // デフォルト: 1,16,31,46分
    return '1,16,31,46 * * * *';
}

// 設定の検証
function validateConfig() {
    const requiredEnvVars = [
        'DISCORD_TOKEN',
        'YOUTUBE_API_KEY'
    ];

    // Firebase設定の検証
    let firebaseConfigValid = false;

    // 方法1: サービスアカウントファイルをチェック
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        if (fs.existsSync(serviceAccountPath)) {
            firebaseConfigValid = true;
        }
    }

    // 方法2: 環境変数をチェック
    if (!firebaseConfigValid) {
        const firebaseRequiredVars = [
            'FIREBASE_PROJECT_ID',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_CLIENT_EMAIL'
        ];

        const missingFirebaseVars = firebaseRequiredVars.filter(varName => !process.env[varName]);

        if (missingFirebaseVars.length === 0) {
            firebaseConfigValid = true;
        } else {
            console.error('Firebase設定が不完全です。以下の環境変数が不足しています:', missingFirebaseVars.join(', '));
        }
    }

    if (!firebaseConfigValid) {
        throw new Error('Firebase設定が見つかりません。サービスアカウントファイルまたは環境変数を正しく設定してください。');
    }

    // その他の必須環境変数をチェック
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        throw new Error(`必要な環境変数が設定されていません: ${missingVars.join(', ')}`);
    }

    if (!module.exports.streamers || module.exports.streamers.length === 0) {
        throw new Error('監視する配信者が設定されていません');
    }

    const streamersWithRoles = module.exports.streamers.filter(s => s.mentionRole);
    if (streamersWithRoles.length > 0) {
        console.log(`✅ ロールボタン機能が有効です (${streamersWithRoles.length}人の配信者)`);
    }

    // Webサーバー設定の表示
    const webConfig = module.exports.webServer;
    if (webConfig.enabled) {
        console.log(`✅ Webサーバー機能が有効です (ポート: ${webConfig.port})`);
    }

    // スケジューラー設定の表示
    const config = module.exports;
    if (config.scheduler.mode === 'cron') {
        const cronPattern = generateCronPattern();
        console.log(`✅ cronスケジュール機能が有効です (パターン: ${cronPattern})`);
        
        if (config.scheduler.cronMinutes) {
            console.log(`   実行分: ${config.scheduler.cronMinutes.join(', ')}分`);
        }
    } else {
        console.log(`✅ 定期実行機能が有効です (間隔: ${config.scheduler.checkInterval / 1000}秒)`);
    }
    
    return true;
}

// cronパターンを取得する関数をエクスポート
module.exports.getCronPattern = generateCronPattern;

// 設定の検証を実行（起動時のみ）
try {
    validateConfig();
    console.log('✅ 設定ファイルの検証が完了しました');
} catch (error) {
    console.error('❌ 設定エラー:', error.message);
    process.exit(1);
}