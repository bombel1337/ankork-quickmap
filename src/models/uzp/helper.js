const cheerio = require('cheerio');

const getLogger = require('../../utils/logger');
const logger = getLogger('uzp-helper');  


class UzpHelper {
    static async getDetailsMetricsDivAndIframe(html) {
        try {
            const $ = cheerio.load(html);
            const metricsDiv = $('div.details-metrics');
          
            if (!metricsDiv.length) {
                throw new Error('div with class "details-metrics" not found');
            }
  
            const iframe = $('#iframeContent');
          
          
            if (!iframe.length) {
                throw new Error('iframe with id "iframeContent" not found');
            }
            if (!metricsDiv.length) {
                throw new Error('div with id "metricsDiv" not found');
            }

            const src = iframe.attr('src');
            const title = iframe.attr('title');
            return {
                detailsMetrics: metricsDiv.html(),
                iFrame: `https://orzeczenia.uzp.gov.pl${src}`,
                title
            };
        } catch (error) {
            throw new Error(`uzpHelper getDetailsMetricsDiv: ${error.message}`);
        }
    }
    static async getDecisionAndResultDivs(html) {
        try {
            const htmlWithNewlines = html.replace(/<br\s*\/?>/gi, '\n');

            const $ = cheerio.load(htmlWithNewlines);
  
            const body = $('body');
            if (!body.length) {
                throw new Error('iframe with "body" not found');
            }
            const markerRegex = /U\s*Z\s*A\s*S\s*A\s*D\s*N\s*I\s*E\s*N\s*I\s*E/i;
            const markerMatch = body.text().match(markerRegex);
      
            if (!markerMatch) {
                logger.warn('"Uzasadnienie" not found');
                return {
                    wholeHtml: body.html(),
                    judgmentDiv: null, 
                    decisionDiv: null
                };           
            }

            const markerIndex = markerMatch.index;
            const judgment = body.text().substring(0, markerIndex);
            const decision =  body.text().substring(markerIndex); 
      
            const judgmentCheerio = cheerio.load(`<div>${judgment}</div>`);
            const decisionCheerio = cheerio.load(`<div>${decision}</div>`);
            return {
                wholeHtml: body.html(),
                judgmentDiv: judgmentCheerio.html(), 
                decisionDiv: decisionCheerio.html()
            };
    
        } catch (error) {
            throw new Error(`uzpHelper getDetailsMetricsDiv: ${error.message}`);
        }
  
    }
}



module.exports = UzpHelper;