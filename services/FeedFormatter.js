// services/FeedFormatter.js
const {
    ContainerBuilder,
    TextDisplayBuilder,
    ButtonBuilder,
    ButtonStyle,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} = require('discord.js');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const logger = require('../utils/logger.js');

/**
 * WebページからOGP画像を取得する
 * @param {string} url ページURL
 * @returns {Promise<string|null>} 画像URL
 */
async function getOgImage(url) {
    try {
        const response = await axios.get(url, { timeout: 5000 });
        const html = response.data;
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // OGP画像を検索
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.getAttribute('content')) {
            return ogImage.getAttribute('content');
        }

        // Twitter Card画像を検索
        const twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (twitterImage && twitterImage.getAttribute('content')) {
            return twitterImage.getAttribute('content');
        }

        // 最初の大きい画像を検索
        const images = Array.from(document.querySelectorAll('img'));
        const largeImages = images.filter(img => {
            const width = parseInt(img.getAttribute('width') || '0', 10);
            const height = parseInt(img.getAttribute('height') || '0', 10);
            return (width >= 200 && height >= 200) ||
                (img.src && (img.src.includes('header') || img.src.includes('thumbnail') || img.src.includes('eyecatch')));
        });

        if (largeImages.length > 0) {
            let imgSrc = largeImages[0].getAttribute('src');
            // 相対パスを絶対パスに変換
            if (imgSrc && imgSrc.startsWith('/')) {
                const baseUrl = new URL(url);
                imgSrc = `${baseUrl.protocol}//${baseUrl.host}${imgSrc}`;
            } else if (imgSrc && !imgSrc.startsWith('http')) {
                const baseUrl = new URL(url);
                imgSrc = `${baseUrl.protocol}//${baseUrl.host}/${imgSrc}`;
            }
            return imgSrc;
        }

        return null;
    } catch (error) {
        logger.error(`ページ画像取得エラー (${url}): ${error.message}`);
        return null;
    }
}

/**
 * RSSアイテムから画像URLを取得する
 * @param {Object} item RSSアイテム
 * @returns {Promise<string|null>} 画像URL
 */
async function getImageFromItem(item) {
    try {
        // RSSパーサーで取得した項目をチェック
        if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
            return item.mediaThumbnail.$.url;
        }

        if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            return item.mediaContent.$.url;
        }

        if (item.enclosure && item.enclosure.url &&
            item.enclosure.type && item.enclosure.type.startsWith('image/')) {
            return item.enclosure.url;
        }

        if (item.image && item.image.url) {
            return item.image.url;
        }

        // RSSにメディアがない場合は、実際の記事ページからOGP画像を取得
        if (item.link) {
            const ogImage = await getOgImage(item.link);
            if (ogImage) {
                return ogImage;
            }
        }

        return null;
    } catch (error) {
        logger.error(`アイテム画像取得エラー: ${error.message}`);
        return null;
    }
}

/**
 * 安全に日付を比較する
 * @param {Date|string} date1 比較する日付1
 * @param {Date|string} date2 比較する日付2
 * @returns {boolean} date1がdate2より新しいならtrue
 */
function safeCompareDate(date1, date2) {
    try {
        if (!date1 || !date2) {
            return false;
        }

        let d1, d2;

        if (typeof date1 === 'string') {
            d1 = new Date(date1);
        } else if (date1 instanceof Date) {
            d1 = date1;
        } else if (date1._seconds !== undefined) {
            d1 = new Date(date1._seconds * 1000);
        } else {
            return false;
        }

        if (typeof date2 === 'string') {
            d2 = new Date(date2);
        } else if (date2 instanceof Date) {
            d2 = date2;
        } else if (date2._seconds !== undefined) {
            d2 = new Date(date2._seconds * 1000);
        } else {
            return false;
        }

        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return false;
        }

        return d1.getTime() > d2.getTime();
    } catch (error) {
        logger.error(`日付比較エラー: ${error.message}`);
        return false;
    }
}

/**
 * RSSアイテムからEmbedを作成する
 * @param {Object} item RSSアイテム
 * @param {Object} feed フィード情報
 * @param {string} faviconUrl ファビコンURL
 * @returns {Promise<ContainerBuilder>} ContainerBuilder
 */
async function createRssEmbed(item, feed) {
    try {
        // 画像URLを取得
        const imageUrl = await getImageFromItem(item);

        // ContainerBuilderを使用して装飾
        const container = new ContainerBuilder();

        // ヘッダー: タイトルとサイト名
        const headerText = new TextDisplayBuilder().setContent(
            `## [${item.title}](${item.link})`
        );
        container.addTextDisplayComponents(headerText);

        container.addSeparatorComponents(separator => {
            separator.setSpacing(SeparatorSpacingSize.Large);
            return separator;
        });

        // 内容セクション
        if (item.contentSnippet) {
            // 内容が長い場合は切り詰める
            const description = item.contentSnippet.length > 500
                ? item.contentSnippet.substring(0, 500).trim() + '...'
                : item.contentSnippet.trim();

            const contentText = new TextDisplayBuilder().setContent(description);
            container.addTextDisplayComponents(contentText);
        }

        container.addSeparatorComponents(separator => {
            separator.setSpacing(SeparatorSpacingSize.Large);
            return separator;
        });

        // 画像の表示
        if (imageUrl) {
            try {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder()
                        .addItems(
                            new MediaGalleryItemBuilder()
                                .setURL(imageUrl)
                        )
                );
            } catch (imageError) {
                logger.error(`画像表示エラー: ${imageError.message}`);
            }
        }

        container.addSeparatorComponents(separator => {
            separator.setSpacing(SeparatorSpacingSize.Large);
            return separator;
        });

        // メタデータセクション
        const metaTextParts = [];

        // カテゴリ
        if (item.categories && item.categories.length > 0) {
            metaTextParts.push(`📁 **カテゴリ**: ${item.categories.join(', ')}`);
        }

        // 著者
        if (item.creator || item.author) {
            const author = item.creator || item.author;
            metaTextParts.push(`✍️ **著者**: ${author}`);
        }

        // 公開日時
        if (item.pubDate) {
            const pubDate = new Date(item.pubDate);
            const formattedDate = pubDate.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'short'
            });

            metaTextParts.push(`📅 **公開日時**: ${formattedDate}`);
        }

        if (metaTextParts.length > 0) {
            const metaText = new TextDisplayBuilder().setContent(metaTextParts.join('\n'));
            container.addTextDisplayComponents(metaText);
        }

        // フッター
        const footerText = new TextDisplayBuilder().setContent(
            `-# RSS経由で自動配信されました`
        );
        container.addTextDisplayComponents(footerText);

        // 記事リンク用ボタン (一番下に配置)
        if (item.link) {
            // 記事リンクボタン
            const readArticleButton = new ButtonBuilder()
                .setLabel('記事を読む')
                .setURL(item.link)
                .setStyle(ButtonStyle.Link)
                .setEmoji('🔗');

            container.addActionRowComponents(row => {
                row.addComponents(readArticleButton);
                return row;
            });
        }

        return container;
    } catch (error) {
        logger.error(`RSSコンテナ作成エラー: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getOgImage,
    getImageFromItem,
    safeCompareDate,
    createRssEmbed,
};