// アプリケーション状態管理
class DashboardApp {
    constructor() {
        this.isConnected = false;
        this.autoRefreshInterval = null;
        this.lastUpdate = null;
        
        this.init();
    }

    async init() {
        // Feather iconsの初期化
        feather.replace();
        
        // 初期データ読み込み
        await this.loadAllData();
        
        // 自動更新の開始
        this.startAutoRefresh();
        
        // イベントリスナーの設定
        this.setupEventListeners();
        
        // 接続状態の監視
        this.monitorConnection();
    }

    // ===========================================
    // データ読み込み関数
    // ===========================================

    async loadAllData() {
        try {
            await Promise.all([
                this.loadStatus(),
                this.loadStreamers(),
                this.loadRssStatus(),
                this.loadLogs()
            ]);
            
            this.updateConnectionStatus(true);
            this.showToast('データを更新しました', 'success');
        } catch (error) {
            console.error('データ読み込みエラー:', error);
            this.updateConnectionStatus(false);
            this.showToast('データの読み込みに失敗しました', 'error');
        }
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.updateBotStatus(data);
            this.updateSystemStatus(data);
            
        } catch (error) {
            console.error('ステータス読み込みエラー:', error);
            this.showConnectionError();
        }
    }

    async loadStreamers() {
        try {
            const response = await fetch('/api/streamers');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const streamers = await response.json();
            this.updateStreamersDisplay(streamers);
            
        } catch (error) {
            console.error('配信者情報読み込みエラー:', error);
        }
    }

    async loadRssStatus() {
        try {
            const response = await fetch('/api/rss');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const rssData = await response.json();
            this.updateRssDisplay(rssData);
            
        } catch (error) {
            console.error('RSS情報読み込みエラー:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/api/logs');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.updateLogsDisplay(data);
            
        } catch (error) {
            console.error('ログ読み込みエラー:', error);
            this.showConnectionError();
        }
    }

    // ===========================================
    // UI更新関数
    // ===========================================

    updateBotStatus(data) {
        // ボットステータス
        const statusValue = document.getElementById('bot-status-value');
        const uptimeText = document.getElementById('uptime-text');
        const totalNotifications = document.getElementById('total-notifications');
        const recentNotifications = document.getElementById('recent-notifications');
        const totalStreamers = document.getElementById('total-streamers');
        const liveCount = document.getElementById('live-count');
        const schedulerMode = document.getElementById('scheduler-mode');
        const schedulerPattern = document.getElementById('scheduler-pattern');

        // ボット状態
        statusValue.innerHTML = `
            <span class="status-indicator ${data.bot.online ? 'online' : 'offline'}">
                ${data.bot.online ? 'オンライン' : 'オフライン'}
            </span>
        `;

        // 稼働時間
        uptimeText.textContent = this.formatUptime(data.bot.uptime);

        // 通知統計
        totalNotifications.textContent = data.stats.totalNotifications || 0;
        recentNotifications.textContent = `24h: ${data.stats.recentNotifications || 0}`;

        // 配信者統計
        totalStreamers.textContent = data.streamers || 0;
        liveCount.textContent = `ライブ: ${data.stats.currentLiveStreams || 0}`;

        // スケジューラー
        schedulerMode.textContent = data.scheduler.mode === 'cron' ? 'Cron' : 'Interval';
        schedulerPattern.textContent = data.scheduler.pattern 
            ? `パターン: ${data.scheduler.pattern}`
            : `間隔: ${data.scheduler.interval}ms`;
    }

    updateSystemStatus(data) {
        const systemStatus = document.getElementById('system-status');
        
        const statusItems = [
            {
                label: 'Discord接続',
                value: data.bot.online ? 'オンライン' : 'オフライン',
                status: data.bot.online ? 'success' : 'error'
            },
            {
                label: 'ボットユーザー',
                value: data.bot.username || '不明',
                status: data.bot.username ? 'success' : 'warning'
            },
            {
                label: 'RSS機能',
                value: data.rss.enabled ? '有効' : '無効',
                status: data.rss.enabled ? 'success' : 'neutral'
            },
            {
                label: '監視配信者数',
                value: `${data.streamers}人`,
                status: data.streamers > 0 ? 'success' : 'warning'
            }
        ];

        systemStatus.innerHTML = statusItems.map(item => `
            <div class="status-item">
                <span class="status-label">${item.label}</span>
                <span class="status-value">
                    <span class="status-dot ${item.status}"></span>
                    ${item.value}
                </span>
            </div>
        `).join('');
    }

    updateStreamersDisplay(streamers) {
        const streamersCount = document.getElementById('streamers-count');
        const streamersList = document.getElementById('streamers-list');
        
        streamersCount.textContent = streamers.length;

        if (streamers.length === 0) {
            streamersList.innerHTML = `
                <div class="empty-state">
                    <i data-feather="users"></i>
                    <p>監視中の配信者がいません</p>
                </div>
            `;
        } else {
            streamersList.innerHTML = streamers.map(streamer => `
                <div class="streamer-item">
                    <div class="streamer-info">
                        <div class="streamer-avatar">
                            ${streamer.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="streamer-details">
                            <h4>${this.escapeHtml(streamer.name)}</h4>
                            <p>${streamer.platform} ${streamer.hasRole ? '• 通知ロール設定済み' : ''}</p>
                        </div>
                    </div>
                    <div class="streamer-status">
                        <span class="badge">${streamer.platform}</span>
                        ${streamer.hasRole ? '<i data-feather="bell" class="text-success"></i>' : ''}
                    </div>
                </div>
            `).join('');
        }
        
        feather.replace();
    }

    updateRssDisplay(rssData) {
        const rssToggle = document.getElementById('rss-toggle');
        const rssStatus = document.getElementById('rss-status');
        
        // トグルスイッチの更新
        if (rssData.enabled) {
            rssToggle.classList.add('active');
        } else {
            rssToggle.classList.remove('active');
        }

        if (!rssData.enabled || rssData.feeds.length === 0) {
            rssStatus.innerHTML = `
                <div class="empty-state">
                    <i data-feather="rss"></i>
                    <p>RSS機能が無効、またはフィードが設定されていません</p>
                </div>
            `;
        } else {
            rssStatus.innerHTML = rssData.feeds.map(feed => `
                <div class="rss-feed">
                    <div class="rss-feed-info">
                        <h4>${this.escapeHtml(feed.name)}</h4>
                        <p>チャンネル数: ${feed.channels}</p>
                    </div>
                    <div class="rss-feed-status">
                        <span class="status-dot ${feed.enabled ? 'success' : 'neutral'}"></span>
                        <span>${feed.enabled ? '有効' : '無効'}</span>
                    </div>
                </div>
            `).join('');
        }
        
        feather.replace();
    }

    updateLogsDisplay(data) {
        const logsContainer = document.getElementById('logs-container');
        
        if (data.error) {
            logsContainer.textContent = data.error;
            return;
        }
        
        if (!data.recentLines || data.recentLines.length === 0) {
            logsContainer.textContent = 'ログが見つかりません';
            return;
        }
        
        // ログレベルに応じた色分け
        const formattedLogs = data.recentLines.map(line => {
            let className = '';
            if (line.includes('ERROR')) className = 'log-error';
            else if (line.includes('WARN')) className = 'log-warning';
            else if (line.includes('INFO')) className = 'log-info';
            else if (line.includes('DEBUG')) className = 'log-debug';
            
            return `<div class="${className}">${this.escapeHtml(line)}</div>`;
        }).join('');
        
        logsContainer.innerHTML = formattedLogs;
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // ===========================================
    // ユーティリティ関数
    // ===========================================

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}日 ${hours}時間`;
        } else if (hours > 0) {
            return `${hours}時間 ${minutes}分`;
        } else if (minutes > 0) {
            return `${minutes}分`;
        } else {
            return `${seconds}秒`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===========================================
    // 接続・状態管理
    // ===========================================

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (connected) {
            statusDot.classList.remove('disconnected');
            statusText.textContent = 'オンライン';
            this.lastUpdate = new Date();
        } else {
            statusDot.classList.add('disconnected');
            statusText.textContent = 'オフライン';
        }
    }

    showConnectionError() {
        // 接続エラー時の処理
        const elements = [
            'bot-status-value',
            'total-notifications',
            'total-streamers',
            'scheduler-mode'
        ];
        
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '<span class="text-error">エラー</span>';
            }
        });
    }

    monitorConnection() {
        setInterval(async () => {
            try {
                const response = await fetch('/health');
                if (response.ok) {
                    this.updateConnectionStatus(true);
                } else {
                    this.updateConnectionStatus(false);
                }
            } catch (error) {
                this.updateConnectionStatus(false);
            }
        }, 10000); // 10秒ごとに接続確認
    }

    // ===========================================
    // 自動更新
    // ===========================================

    startAutoRefresh() {
        // 30秒ごとに自動更新
        this.autoRefreshInterval = setInterval(() => {
            this.loadStatus();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // ===========================================
    // イベント処理
    // ===========================================

    setupEventListeners() {
        // 手動更新ボタン
        const refreshButtons = document.querySelectorAll('[onclick*="loadStatus"], [onclick*="loadLogs"], [onclick*="loadAllData"]');
        refreshButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleButtonClick(button);
            });
        });
    }

    async handleButtonClick(button) {
        // ボタンアニメーション
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);

        // ローディング状態
        const icon = button.querySelector('i');
        if (icon) {
            icon.style.animation = 'spin 1s linear infinite';
            setTimeout(() => {
                icon.style.animation = '';
            }, 1000);
        }
    }

    clearLogs() {
        const logsContainer = document.getElementById('logs-container');
        logsContainer.innerHTML = '<div class="text-secondary">ログがクリアされました</div>';
        this.showToast('ログをクリアしました', 'success');
    }

    // ===========================================
    // 通知システム
    // ===========================================

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // 3秒後に削除
        setTimeout(() => {
            toast.style.animation = 'toast-slide-out 0.3s ease-in forwards';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// ===========================================
// グローバル関数（HTML側から呼び出し用）
// ===========================================

let app;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    app = new DashboardApp();
});

// HTML側のonclick属性用の関数
async function loadAllData() {
    if (app) await app.loadAllData();
}

async function loadStatus() {
    if (app) await app.loadStatus();
}

async function loadLogs() {
    if (app) await app.loadLogs();
}

function clearLogs() {
    if (app) app.clearLogs();
}

// ===========================================
// CSS追加（ログの色分け用）
// ===========================================

const style = document.createElement('style');
style.textContent = `
    .log-error { color: #ef4444; }
    .log-warning { color: #f59e0b; }
    .log-info { color: #06b6d4; }
    .log-debug { color: #64748b; }
    .text-error { color: #ef4444; }
    .text-success { color: #10b981; }
    .text-secondary { color: #64748b; }
    
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 2rem;
        color: #64748b;
        text-align: center;
    }
    
    .empty-state i {
        width: 48px;
        height: 48px;
        opacity: 0.5;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    @keyframes toast-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .status-dot.success { background: #10b981; }
    .status-dot.error { background: #ef4444; }
    .status-dot.warning { background: #f59e0b; }
    .status-dot.neutral { background: #64748b; }
`;

document.head.appendChild(style);