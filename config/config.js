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

    // チェック間隔 (ミリ秒)
    checkInterval: 5 * 60 * 1000, // 5分

    // 1回のチェックで取得する最大動画数
    maxVideosToCheck: 5,

    // 監視する配信者リスト
    streamers: [
        {
            name: "しけお",
            platform: "youtube", // youtube, twitch
            channelId: "UCU2-bJN1yP-G4KuXzVipFPA", // YouTubeチャンネルID
            notificationChannelId: "1385170391227437166", // Discord通知チャンネルID
            customMessage: "🎬 {streamerName} の新しい動画がアップロードされました！", // カスタムメッセージ (オプション)
            mentionRole: "" // メンション対象ロールID (オプション)
        },
        // 必要に応じて追加
    ],

    // Twitch設定 (将来の拡張用)
    twitch: {
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || './logs/bot.log'
    },

    // データベース設定 (SQLite)
    database: {
        path: process.env.DB_PATH || './data/notifications.db'
    }
};

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

    return true;
}

// 設定の検証を実行（起動時のみ）
try {
    validateConfig();
    console.log('✅ 設定ファイルの検証が完了しました');
} catch (error) {
    console.error('❌ 設定エラー:', error.message);
    console.error('\n📝 設定方法:');
    console.error('1. Firebase Console でプロジェクトを作成');
    console.error('2. サービスアカウントをダウンロード');
    console.error('3. 環境変数を設定 (詳細はREADME.mdを参照)');
    process.exit(1);
}