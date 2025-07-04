// utils/favicon-utils.js
const axios = require('axios');
const logger = require('./logger.js');

/**
 * ドメインからサブドメインを削除する
 * @param {string} domain ドメイン
 * @returns {string} メインドメイン
 */
function removeSubdomain(domain) {
    try {
        // IPアドレスの場合はそのまま返す
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
            return domain;
        }

        // ドメイン部分を分割
        const parts = domain.split('.');
        
        // 2つ以下の部分しかない場合はそのまま返す
        if (parts.length <= 2) {
            return domain;
        }
        
        // 特殊なTLDを考慮
        const specialTlds = ['co.jp', 'co.uk', 'com.au', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'org.uk', 'net.uk', 'ac.uk'];
        
        const lastTwoParts = parts.slice(-2).join('.');
        if (specialTlds.includes(lastTwoParts)) {
            return parts.slice(-3).join('.');
        } else {
            return parts.slice(-2).join('.');
        }
    } catch (error) {
        logger.error(`ドメイン処理エラー(${domain}):`, error);
        return domain;
    }
}

/**
 * ドメインからファビコンURLを取得する
 * @param {string} domain ドメイン
 * @returns {Promise<string>} ファビコンURL
 */
async function getFavicon(domain) {
    try {
        const mainDomain = removeSubdomain(domain);
        logger.debug(`ドメイン変換: ${domain} → ${mainDomain}`);
        
        // Clearbitのロゴ取得を最初に試みる
        try {
            const clearbitUrl = `https://logo.clearbit.com/${mainDomain}?size=128`;
            const response = await axios.head(clearbitUrl, { timeout: 3000 });
            if (response.status === 200) {
                logger.debug(`Clearbitからロゴを取得: ${clearbitUrl}`);
                return clearbitUrl;
            }
        } catch (clearbitError) {
            logger.debug(`Clearbitロゴ取得エラー: ${clearbitError.message}`);
        }
        
        // Googleのファビコンサービスを使用
        const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${mainDomain}&sz=128&ext=png`;
        logger.debug(`Google Faviconサービス使用: ${googleFaviconUrl}`);
        return googleFaviconUrl;
        
    } catch (error) {
        logger.error(`ファビコン取得エラー(${domain}):`, error);
        const mainDomain = removeSubdomain(domain);
        return `https://www.google.com/s2/favicons?domain=${mainDomain}&sz=128&ext=png`;
    }
}

module.exports = {
    getFavicon,
    removeSubdomain
};