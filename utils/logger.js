// utils/logger.js
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFile = process.env.LOG_FILE || './logs/bot.log';
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = this.levels[this.logLevel] || this.levels.info;
        this.ensureLogDirectory();
    }

    /**
     * ログディレクトリを作成
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * ログメッセージをフォーマット
     * @param {string} level - ログレベル
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     * @returns {string} フォーマット済みログメッセージ
     */
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase().padEnd(5);
        
        let logMessage = `[${timestamp}] ${levelUpper} ${message}`;
        
        if (data !== null) {
            if (data instanceof Error) {
                logMessage += `\n  Error: ${data.message}`;
                if (data.stack) {
                    logMessage += `\n  Stack: ${data.stack}`;
                }
            } else if (typeof data === 'object') {
                try {
                    logMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
                } catch (err) {
                    logMessage += `\n  Data: [Circular or Invalid JSON]`;
                }
            } else {
                logMessage += `\n  Data: ${data}`;
            }
        }
        
        return logMessage;
    }

    /**
     * コンソールに色付きログを出力
     * @param {string} level - ログレベル
     * @param {string} message - フォーマット済みメッセージ
     */
    logToConsole(level, message) {
        const colors = {
            error: '\x1b[31m', // 赤
            warn: '\x1b[33m',  // 黄
            info: '\x1b[36m',  // シアン
            debug: '\x1b[90m'  // グレー
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || '';
        
        console.log(`${color}${message}${reset}`);
    }

    /**
     * ファイルにログを書き込み
     * @param {string} message - フォーマット済みメッセージ
     */
    logToFile(message) {
        try {
            fs.appendFileSync(this.logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('ログファイル書き込みエラー:', error);
        }
    }

    /**
     * ログを出力
     * @param {string} level - ログレベル
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     */
    log(level, message, data = null) {
        if (this.levels[level] > this.currentLevel) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, data);
        
        // コンソールに出力
        this.logToConsole(level, formattedMessage);
        
        // ファイルに出力
        this.logToFile(formattedMessage);
    }

    /**
     * エラーログ
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     */
    error(message, data = null) {
        this.log('error', message, data);
    }

    /**
     * 警告ログ
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     */
    warn(message, data = null) {
        this.log('warn', message, data);
    }

    /**
     * 情報ログ
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     */
    info(message, data = null) {
        this.log('info', message, data);
    }

    /**
     * デバッグログ
     * @param {string} message - メッセージ
     * @param {any} data - 追加データ
     */
    debug(message, data = null) {
        this.log('debug', message, data);
    }

    /**
     * ログファイルをローテーション
     * @param {number} maxSizeMB - 最大ファイルサイズ (MB)
     */
    rotateLogFile(maxSizeMB = 10) {
        try {
            if (!fs.existsSync(this.logFile)) {
                return;
            }

            const stats = fs.statSync(this.logFile);
            const fileSizeMB = stats.size / (1024 * 1024);

            if (fileSizeMB > maxSizeMB) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedFile = this.logFile.replace('.log', `_${timestamp}.log`);
                
                fs.renameSync(this.logFile, rotatedFile);
                this.info(`ログファイルをローテーションしました: ${rotatedFile}`);
                
                // 古いログファイルを削除 (10個以上保持しない)
                this.cleanupOldLogs();
            }
        } catch (error) {
            console.error('ログローテーションエラー:', error);
        }
    }

    /**
     * 古いログファイルを削除
     */
    cleanupOldLogs() {
        try {
            const logDir = path.dirname(this.logFile);
            const baseName = path.basename(this.logFile, '.log');
            
            const files = fs.readdirSync(logDir)
                .filter(file => file.startsWith(baseName) && file.endsWith('.log'))
                .filter(file => file !== path.basename(this.logFile))
                .map(file => ({
                    name: file,
                    path: path.join(logDir, file),
                    time: fs.statSync(path.join(logDir, file)).mtime
                }))
                .sort((a, b) => b.time - a.time);

            // 10個以上のログファイルがある場合、古いものを削除
            if (files.length > 10) {
                const filesToDelete = files.slice(10);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    this.info(`古いログファイルを削除しました: ${file.name}`);
                });
            }
        } catch (error) {
            console.error('古いログファイル削除エラー:', error);
        }
    }

    /**
     * ログ統計を取得
     * @returns {Object} ログ統計情報
     */
    getLogStats() {
        try {
            if (!fs.existsSync(this.logFile)) {
                return { exists: false };
            }

            const stats = fs.statSync(this.logFile);
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            const logCounts = {
                error: 0,
                warn: 0,
                info: 0,
                debug: 0
            };

            lines.forEach(line => {
                Object.keys(logCounts).forEach(level => {
                    if (line.includes(level.toUpperCase())) {
                        logCounts[level]++;
                    }
                });
            });

            return {
                exists: true,
                fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                totalLines: lines.length,
                lastModified: stats.mtime,
                logCounts
            };

        } catch (error) {
            this.error('ログ統計取得エラー:', error);
            return { exists: false, error: error.message };
        }
    }
}

// シングルトンとしてエクスポート
module.exports = new Logger();