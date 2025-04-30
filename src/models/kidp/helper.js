const getLogger = require('../../utils/logger');
const logger = getLogger('ms-helper');  
const cheerio = require('cheerio');

class KidpHelper {
    static getCounselorDetails(html) {
        try {            
            const $ = cheerio.load(html);
            const counselorBox = $('.counselor_box');
            
            // Extract basic info
            const name = counselorBox.find('h2 strong').text().trim();
            const registrationNumber = counselorBox.find('.section_header p').text().trim().replace('NUMER WPISU ', '');
            
            // Extract description
            const description = counselorBox.find('div[style="text-align: justify;"] p').text().trim();
            
            // Extract contact information
            const address = counselorBox.find('.contact_box ul li:first-child p').text().trim();
            const phone = counselorBox.find('.contact_box .phone a').text().trim();
            const email = counselorBox.find('.contact_box .mail a').text().trim();
            
            // Extract image
            const imageStyle = counselorBox.find('.image').attr('style') || '';
            const imageMatch = imageStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
            const image = imageMatch ? imageMatch[1] : '';
            
            // Social links
            const socialLinks = {
                twitter: '',
                linkedin: '',
                facebook: '',
                other: []
            };
            counselorBox.find('.social ul li a').each((index, element) => {
                if ($(element).attr('href').includes('linkedin.com')) {
                    socialLinks.linkedin = $(element).attr('href');
                } else if ($(element).attr('href').includes('twitter')) {
                    socialLinks.twitter = $(element).attr('href');
                } else if ($(element).attr('href').includes('facebook')) {
                    socialLinks.facebook = $(element).attr('href');
                } else {
                    socialLinks.other.push($(element).attr('href'));
                }
            });
            
            // Extract features/specialties
            const features = [];
            counselorBox.find('.featuress ul li p').each((index, element) => {
                features.push($(element).text().trim());
            });
            
            return {
                name,
                registrationNumber,
                description,
                contact: {
                    address,
                    phone,
                    email
                },
                image,
                socialLinks,
                features
            };
        } catch (error) {
            logger.error(`KidpHelper getCounselorDetails: ${error.message}`);
            throw new Error(`KidpHelper getCounselorDetails: ${error.message}`);
        }
    }
    static getDetailsExtendedScrape(html) {
        try {            
            const $ = cheerio.load(html);
            const advisors = [];
    
            $('ul.mainlist > li, ul.helplist > li').each((index, element) => {
                const item = $(element);
                const linkElement = item.find('a');
                
                const url = linkElement.attr('href');
                const image = linkElement.find('.image').attr('style')?.match(/url\('([^']+)'\)/)?.[1] || '';
                const name = linkElement.find('.desc p strong').text().trim();
                
                advisors.push({
                    url,
                    name,
                    image,
                    specialties: item.attr('class').split('  ').filter(cls => cls !== 'filterall')
                });
            });
    
            return advisors;
        } catch (error) {
            logger.error(`KidpHelper getDetails: ${error.message}`);
            throw new Error(`KidpHelper getDetails: ${error.message}`);
        }
    }

    static getDetails(html) {
        try {            
            const $ = cheerio.load(html);
            const advisors = [];

            $('.link-rows__item').each((index, element) => {
                const item = $(element);
                const linkElement = item.find('a');
                
                const url = linkElement.attr('href');
                const title = linkElement.find('.link-rows__title').text().trim();
                const info = linkElement.find('.link-rows__info').text().trim();
                
                advisors.push({
                    url,
                    title,
                    info
                });
            });

            return advisors;
        } catch (error) {
            logger.error(`KidpHelper getDetails: ${error.message}`);
            throw new Error(`KidpHelper getDetails: ${error.message}`);
        }
    }

    static isLastPage(html) {
        try {
            const $ = cheerio.load(html);

            const isDisabled = $('.pagination__item.pagination__item--next.is-disabled').length > 0;
            return isDisabled;
        } catch (error) {
            logger.error(`KidpHelper isLastPage: ${error.message}`);
            throw new Error(`KidpHelper isLastPage: ${error.message}`);
        }
    }
}

module.exports = KidpHelper;