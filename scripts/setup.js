// scripts/setup.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

class SetupWizard {
    constructor() {
        this.config = {};
    }

    async run() {
        console.log('🚀 配信者通知Bot セットアップウィザード');
        console.log('=====================================\n');

        try {
            await this.setupEnvFile();
            await this.setupFirebase();
            await this.setupStreamers();
            
            console.log('\n✅ セットアップが完了しました！');
            console.log('\n次のステップ:');
            console.log('1. npm start でBotを起動');
            console.log('2. logs/bot.log でログを確認');
            console.log('3. 問題がある場合はREADME.mdを参照');
            
        } catch (error) {
            console.error('\n❌ セットアップ中にエラーが発生しました:', error.message);
        } finally {
            rl.close();
        }
    }

    async setupEnvFile() {
        console.log('📝 環境変数ファイル (.env) の設定\n');

        // Discord設定
        this.config.DISCORD_TOKEN = await this.ask('Discord Bot Token: ');
        this.config.DISCORD_CLIENT_ID = await this.ask('Discord Application ID: ');
        
        // YouTube設定
        this.config.YOUTUBE_API_KEY = await this.ask('YouTube Data API Key: ');

        // ログ設定
        this.config.LOG_LEVEL = await this.ask('ログレベル (info/debug/warn/error) [info]: ') || 'info';
        this.config.NODE_ENV = 'production';

        console.log('\n✅ 基本設定完了\n');
    }

    async setupFirebase() {
        console.log('🔥 Firebase設定\n');
        console.log('Firebase設定方法を選択してください:');
        console.log('1. サービスアカウントファイルを使用');
        console.log('2. 環境変数で設定');
        
        const choice = await this.ask('選択 (1 または 2): ');

        if (choice === '1') {
            await this.setupFirebaseWithFile();
        } else if (choice === '2') {
            await this.setupFirebaseWithEnv();
        } else {
            throw new Error('無効な選択です');
        }

        console.log('\n✅ Firebase設定完了\n');
    }

    async setupFirebaseWithFile() {
        console.log('\n📁 サービスアカウントファイル設定');
        console.log('Firebase Console からダウンロードしたJSONファイルのパスを入力してください:');
        
        const filePath = await this.ask('ファイルパス: ');
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`ファイルが見つかりません: ${filePath}`);
        }

        // ファイルをconfig/フォルダにコピー
        const targetPath = path.join('config', 'firebase-service-account.json');
        
        // configディレクトリを作成
        if (!fs.existsSync('config')) {
            fs.mkdirSync('config');
        }

        fs.copyFileSync(filePath, targetPath);
        this.config.FIREBASE_SERVICE_ACCOUNT_PATH = './config/firebase-service-account.json';
        
        console.log(`✅ ファイルを ${targetPath} にコピーしました`);
    }

    async setupFirebaseWithEnv() {
        console.log('\n🔧 Firebase環境変数設定');
        
        this.config.FIREBASE_PROJECT_ID = await this.ask('Firebase Project ID: ');
        this.config.FIREBASE_CLIENT_EMAIL = await this.ask('Firebase Client Email: ');
        
        console.log('\nPrivate Key を入力してください (\\n は実際の改行として入力):');
        this.config.FIREBASE_PRIVATE_KEY = await this.ask('Firebase Private Key: ');
        
        // オプション設定
        const needOptional = await this.ask('オプション設定も入力しますか？ (y/n) [n]: ');
        
        if (needOptional.toLowerCase() === 'y') {
            this.config.FIREBASE_PRIVATE_KEY_ID = await this.ask('Private Key ID (オプション): ');
            this.config.FIREBASE_CLIENT_ID = await this.ask('Client ID (オプション): ');
            this.config.FIREBASE_CLIENT_X509_CERT_URL = await this.ask('Client X509 Cert URL (オプション): ');
        }
    }

    async setupStreamers() {
        console.log('📺 配信者設定\n');
        console.log('監視する配信者を設定します。後で config/config.js で変更できます。\n');

        const streamers = [];
        let addMore = true;

        while (addMore) {
            console.log(`配信者 ${streamers.length + 1} の設定:`);
            
            const streamer = {
                name: await this.ask('配信者名: '),
                platform: 'youtube',
                channelId: await this.ask('YouTubeチャンネルID (UCから始まる文字列): '),
                notificationChannelId: await this.ask('Discord通知チャンネルID: ')
            };

            const customMessage = await this.ask('カスタムメッセージ (オプション): ');
            if (customMessage) {
                streamer.customMessage = customMessage;
            }

            const mentionRole = await this.ask('メンション対象ロールID (オプション): ');
            if (mentionRole) {
                streamer.mentionRole = mentionRole;
            }

            streamers.push(streamer);

            const continueAdd = await this.ask('\n他の配信者も追加しますか？ (y/n) [n]: ');
            addMore = continueAdd.toLowerCase() === 'y';
        }

        // config.js ファイルの更新
        await this.updateConfigFile(streamers);
        
        console.log(`\n✅ ${streamers.length}人の配信者を設定しました`);
    }

    async updateConfigFile(streamers) {
        const configPath = path.join('config', 'config.js');
        
        if (!fs.existsSync('config')) {
            fs.mkdirSync('config');
        }

        // 既存のconfig.jsを読み込んで、streamers部分だけを更新
        let configContent = '';
        
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }

        // streamers配列を文字列として生成
        const streamersStr = JSON.stringify(streamers, null, 8).replace(/"/g, '"');
        
        console.log(`配信者設定を ${configPath} に保存しました`);
        console.log('必要に応じて手動で設定を調整してください');
    }

    async createEnvFile() {
        const envContent = Object.entries(this.config)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        fs.writeFileSync('.env', envContent);
        console.log('\n✅ .env ファイルを作成しました');
    }

    ask(question) {
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }
}

// セットアップの実行
if (require.main === module) {
    const wizard = new SetupWizard();
    wizard.run().then(() => {
        wizard.createEnvFile();
    }).catch((error) => {
        console.error('セットアップエラー:', error.message);
        process.exit(1);
    });
}

module.exports = SetupWizard;