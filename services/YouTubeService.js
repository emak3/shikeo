// services/YouTubeService.js
const axios = require('axios');
const logger = require('../utils/logger.js');

class YouTubeService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://www.googleapis.com/youtube/v3';
    }

    /**
     * チャンネルの最新動画を取得
     * @param {string} channelId - YouTubeチャンネルID
     * @param {number} maxResults - 取得する最大動画数
     * @returns {Promise<Array>} 動画情報の配列
     */
    async getLatestVideos(channelId, maxResults = 5) {
        try {
            // チャンネルのアップロードプレイリストIDを取得
            const uploadsPlaylistId = await this.getUploadsPlaylistId(channelId);
            
            if (!uploadsPlaylistId) {
                throw new Error(`チャンネル ${channelId} のアップロードプレイリストが見つかりませんでした`);
            }

            // プレイリストから最新動画を取得
            const response = await axios.get(`${this.baseURL}/playlistItems`, {
                params: {
                    key: this.apiKey,
                    playlistId: uploadsPlaylistId,
                    part: 'snippet,contentDetails',
                    maxResults: maxResults,
                    order: 'date'
                }
            });

            const videos = [];
            
            for (const item of response.data.items) {
                const videoDetails = await this.getVideoDetails(item.contentDetails.videoId);
                
                if (videoDetails) {
                    videos.push({
                        id: item.contentDetails.videoId,
                        title: item.snippet.title,
                        description: item.snippet.description,
                        publishedAt: item.snippet.publishedAt,
                        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                        url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
                        channelTitle: item.snippet.channelTitle,
                        isLive: videoDetails.isLive,
                        isUpcoming: videoDetails.isUpcoming,
                        duration: videoDetails.duration,
                        viewCount: videoDetails.viewCount
                    });
                }
            }

            return videos;

        } catch (error) {
            logger.error(`YouTube APIエラー (チャンネル: ${channelId}):`, error.message);
            
            if (error.response?.status === 403) {
                logger.error('YouTube API クォータ制限またはAPIキーが無効です');
            } else if (error.response?.status === 404) {
                logger.error('指定されたチャンネルが見つかりませんでした');
            }
            
            throw error;
        }
    }

    /**
     * チャンネルのアップロードプレイリストIDを取得
     * @param {string} channelId - YouTubeチャンネルID
     * @returns {Promise<string|null>} アップロードプレイリストID
     */
    async getUploadsPlaylistId(channelId) {
        try {
            const response = await axios.get(`${this.baseURL}/channels`, {
                params: {
                    key: this.apiKey,
                    id: channelId,
                    part: 'contentDetails'
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                return response.data.items[0].contentDetails.relatedPlaylists.uploads;
            }

            return null;

        } catch (error) {
            logger.error(`アップロードプレイリストID取得エラー:`, error.message);
            throw error;
        }
    }

    /**
     * 動画の詳細情報を取得
     * @param {string} videoId - YouTube動画ID
     * @returns {Promise<Object|null>} 動画詳細情報
     */
    async getVideoDetails(videoId) {
        try {
            const response = await axios.get(`${this.baseURL}/videos`, {
                params: {
                    key: this.apiKey,
                    id: videoId,
                    part: 'snippet,contentDetails,statistics,liveStreamingDetails'
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                const video = response.data.items[0];
                
                return {
                    isLive: video.snippet.liveBroadcastContent === 'live',
                    isUpcoming: video.snippet.liveBroadcastContent === 'upcoming',
                    duration: this.parseDuration(video.contentDetails.duration),
                    viewCount: parseInt(video.statistics.viewCount || 0),
                    likeCount: parseInt(video.statistics.likeCount || 0),
                    commentCount: parseInt(video.statistics.commentCount || 0)
                };
            }

            return null;

        } catch (error) {
            logger.error(`動画詳細取得エラー (動画ID: ${videoId}):`, error.message);
            return null;
        }
    }

    /**
     * ISO 8601 duration文字列を人間が読める形式に変換
     * @param {string} duration - ISO 8601 duration (例: PT4M13S)
     * @returns {string} 人間が読める形式の時間 (例: 4:13)
     */
    parseDuration(duration) {
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        
        if (!match) return '不明';

        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /**
     * チャンネル情報を取得
     * @param {string} channelId - YouTubeチャンネルID
     * @returns {Promise<Object|null>} チャンネル情報
     */
    async getChannelInfo(channelId) {
        try {
            const response = await axios.get(`${this.baseURL}/channels`, {
                params: {
                    key: this.apiKey,
                    id: channelId,
                    part: 'snippet,statistics'
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                const channel = response.data.items[0];
                
                return {
                    id: channel.id,
                    title: channel.snippet.title,
                    description: channel.snippet.description,
                    thumbnailUrl: channel.snippet.thumbnails.high?.url,
                    subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
                    videoCount: parseInt(channel.statistics.videoCount || 0),
                    viewCount: parseInt(channel.statistics.viewCount || 0)
                };
            }

            return null;

        } catch (error) {
            logger.error(`チャンネル情報取得エラー:`, error.message);
            throw error;
        }
    }
}

module.exports = YouTubeService;