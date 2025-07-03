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

    // 通知設定
    notification: {
        // Display Components V2を使用するかどうか
        useDisplayComponents: process.env.USE_DISPLAY_COMPONENTS === 'true' || true, // デフォルトはtrue
        
        // フォールバック設定（Display Componentsが失敗した場合）
        fallbackToLegacy: process.env.FALLBACK_TO_LEGACY === 'true' || true,
        
        // サムネイル画像を通知に含めるかどうか
        includeThumbnail: process.env.INCLUDE_THUMBNAIL === 'true' || true,
        
        // 説明文の最大文字数
        maxDescriptionLength: parseInt(process.env.MAX_DESCRIPTION_LENGTH) || 200,
        
        // デバッグモード（詳細なログ出力）
        debugMode: process.env.NOTIFICATION_DEBUG === 'true' || false
    },

    // 監視する配信者リスト
    streamers: [
        {
            name: "しけお",
            platform: "youtube", // youtube, twitch
            channelId: "UCU2-bJN1yP-G4KuXzVipFPA", // YouTubeチャンネルID
            notificationChannelId: "1385170391227437166", // Discord通知チャンネルID
            customMessage: "", // カスタムメッセージ (オプション)
            mentionRole: "", // メンション対象ロールID (オプション)
            
            // Display Components固有設定
            displaySettings: {
                // この配信者のみDisplay Componentsを無効にする場合
                forceDisableDisplayComponents: false,
                
                // カスタムサムネイルURL（指定した場合、チャンネルのデフォルトサムネイルの代わりに使用）
                customThumbnailUrl: "",
                
                // 通知スタイル（'minimal', 'standard', 'detailed'）
                notificationStyle: 'standard'
            }
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

    // データベース設定 (SQLite)
    database: {
        path: process.env.DB_PATH || './data/notifications.db'
    },

    // インタラクション設定
    interactions: {
        // 通知設定ボタンの有効時間（ミリ秒）
        buttonTimeout: 30 * 60 * 1000, // 30分
        
        // 通知設定を許可するロール
        allowedRoles: [
            // ロールIDを追加
        ],
        
        // 管理者専用機能を使用できるロール
        adminRoles: [
            // 管理者ロールIDを追加
        ]
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

    // Display Components設定の検証
    if (module.exports.notification.useDisplayComponents) {
        console.log('✅ Display Components V2を使用します');
        
        if (module.exports.notification.fallbackToLegacy) {
            console.log('✅ フォールバック機能が有効です（従来形式への自動切替）');
        }
    } else {
        console.log('⚠️  従来のActionRow形式を使用します');
    }

    return true;
}

// 設定の検証を実行（起動時のみ）
try {
    validateConfig();
    console.log('✅ 設定ファイルの検証が完了しました');
} catch (error) {
    console.error('❌ 設定エラー:', error.message);
    process.exit(1);
}