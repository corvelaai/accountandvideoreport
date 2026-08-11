const express = require('express');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const router = express.Router();

// TikTok Real Reporting Service
class TikTokRealReportingService {
  constructor() {
    this.reportHistory = [];
    this.emailTransporter = this.setupEmailTransporter();
    this.browser = null;
  }

  // Setup email transporter for TikTok reporting
  setupEmailTransporter() {
    return nodemailer.createTransporter({
      service: 'gmail', // or your preferred email service
      auth: {
        user: process.env.GOVERNMENT_EMAIL_USER, // Government email
        pass: process.env.GOVERNMENT_EMAIL_PASS  // Government email password
      }
    });
  }

  // Initialize browser for web automation
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false, // Set to true for production
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  // Real TikTok web reporting
  async reportToTikTokWeb(videoUrl, reportData) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      console.log(`[TikTok Web] Starting report for: ${videoUrl}`);
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to the video
      await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for page to load
      await page.waitForTimeout(3000);
      
      // Try to find and click the more options button (three dots)
      try {
        await page.waitForSelector('[data-e2e="more-btn"]', { timeout: 10000 });
        await page.click('[data-e2e="more-btn"]');
        console.log('[TikTok Web] Clicked more options button');
      } catch (error) {
        // Fallback selectors for different TikTok layouts
        const selectors = [
          '[aria-label="More"]',
          '.tiktok-1qbxv2o-DivMoreActionContainer',
          '[data-testid="more-button"]',
          'button[aria-label="More options"]'
        ];
        
        let clicked = false;
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            await page.click(selector);
            console.log(`[TikTok Web] Clicked more options with selector: ${selector}`);
            clicked = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!clicked) {
          throw new Error('Could not find more options button');
        }
      }
      
      // Wait for dropdown menu
      await page.waitForTimeout(2000);
      
      // Click report option
      try {
        await page.waitForSelector('text/Report', { timeout: 5000 });
        await page.click('text/Report');
        console.log('[TikTok Web] Clicked report option');
      } catch (error) {
        // Fallback selectors for report button
        const reportSelectors = [
          '[data-e2e="report-button"]',
          'button:has-text("Report")',
          '[aria-label="Report"]',
          '.report-button'
        ];
        
        let reportClicked = false;
        for (const selector of reportSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            await page.click(selector);
            console.log(`[TikTok Web] Clicked report with selector: ${selector}`);
            reportClicked = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!reportClicked) {
          throw new Error('Could not find report button');
        }
      }
      
      // Wait for report form
      await page.waitForTimeout(2000);
      
      // Select report reason based on classification
      const reason = this.mapToTikTokReason(reportData.classification);
      try {
        await page.waitForSelector(`text/${reason}`, { timeout: 5000 });
        await page.click(`text/${reason}`);
        console.log(`[TikTok Web] Selected reason: ${reason}`);
      } catch (error) {
        // Fallback: try to select first available reason
        try {
          await page.waitForSelector('input[type="radio"]', { timeout: 3000 });
          await page.click('input[type="radio"]');
          console.log('[TikTok Web] Selected first available reason');
        } catch (e) {
          throw new Error('Could not select report reason');
        }
      }
      
      // Add additional details if text area is available
      try {
        await page.waitForSelector('textarea', { timeout: 3000 });
        await page.type('textarea', `Government fact-checking report: ${reportData.summary}`);
        console.log('[TikTok Web] Added additional details');
      } catch (error) {
        console.log('[TikTok Web] No additional details field found');
      }
      
      // Submit the report
      try {
        await page.waitForSelector('button:has-text("Submit")', { timeout: 5000 });
        await page.click('button:has-text("Submit")');
        console.log('[TikTok Web] Submitted report');
      } catch (error) {
        // Fallback submit buttons
        const submitSelectors = [
          '[data-e2e="submit-report"]',
          'button[type="submit"]',
          '.submit-button'
        ];
        
        let submitted = false;
        for (const selector of submitSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            await page.click(selector);
            console.log(`[TikTok Web] Submitted with selector: ${selector}`);
            submitted = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!submitted) {
          throw new Error('Could not submit report');
        }
      }
      
      // Wait for confirmation
      await page.waitForTimeout(3000);
      
      console.log('[TikTok Web] Report submitted successfully');
      return {
        success: true,
        method: 'web_automation',
        timestamp: new Date().toISOString(),
        videoUrl: videoUrl
      };
      
    } catch (error) {
      console.error('[TikTok Web] Reporting failed:', error.message);
      return {
        success: false,
        method: 'web_automation',
        error: error.message,
        timestamp: new Date().toISOString(),
        videoUrl: videoUrl
      };
    } finally {
      await page.close();
    }
  }

  // Real TikTok email reporting
  async reportToTikTokEmail(videoUrl, reportData) {
    try {
      console.log(`[TikTok Email] Sending email report for: ${videoUrl}`);
      
      const emailContent = {
        from: process.env.GOVERNMENT_EMAIL_USER,
        to: [
          'legal@tiktok.com',
          'feedback@tiktok.com',
          'privacy@tiktok.com'
        ],
        subject: `URGENT: Government Misinformation Report - ${reportData.platform} Content Violation`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <h2 style="color: #e74c3c; margin: 0;">🚨 GOVERNMENT MISINFORMATION REPORT</h2>
                  <p style="margin: 10px 0 0 0; color: #666;">Official Report from Uganda Government - EchoGuard System</p>
                </div>
                
                <div style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                  <h3 style="color: #2c3e50; margin-top: 0;">📋 Report Details</h3>
                  
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Content URL:</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="${videoUrl}" target="_blank">${videoUrl}</a></td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Platform:</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee;">${reportData.platform}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Classification:</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">${reportData.classification.toUpperCase()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Confidence Score:</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee;">${reportData.confidenceScore}%</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Report Date:</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date().toISOString()}</td>
                    </tr>
                  </table>
                  
                  <h3 style="color: #2c3e50; margin-top: 20px;">🤖 AI Analysis</h3>
                  <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                    <p><strong>Summary:</strong> ${reportData.summary}</p>
                    <p><strong>Reasoning:</strong> ${reportData.reasoning}</p>
                  </div>
                  
                  <h3 style="color: #2c3e50;">⚖️ Legal Basis</h3>
                  <ul style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
                    <li><strong>Public Interest:</strong> Protecting citizens from misinformation</li>
                    <li><strong>Government Authority:</strong> Official fact-checking by Uganda Government</li>
                    <li><strong>Platform Policy:</strong> Violates TikTok Community Guidelines on misinformation</li>
                  </ul>
                  
                  <h3 style="color: #2c3e50;">📞 Contact Information</h3>
                  <div style="background: #d1ecf1; padding: 15px; border-radius: 5px;">
                    <p><strong>Reporting Organization:</strong> Uganda Government - EchoGuard</p>
                    <p><strong>Contact Email:</strong> reporting@echoguard.ug</p>
                    <p><strong>Legal Authority:</strong> Government of Uganda</p>
                    <p><strong>Priority Level:</strong> HIGH - Misinformation affecting public safety</p>
                  </div>
                  
                  <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin-top: 20px; text-align: center;">
                    <p style="margin: 0; color: #155724;"><strong>⚠️ URGENT ACTION REQUIRED</strong></p>
                    <p style="margin: 5px 0 0 0; color: #155724;">This content requires immediate review and removal due to potential harm to public safety and democratic processes.</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `
      };

      const result = await this.emailTransporter.sendMail(emailContent);
      console.log('[TikTok Email] Email sent successfully:', result.messageId);
      
      return {
        success: true,
        method: 'email',
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        recipients: emailContent.to
      };
      
    } catch (error) {
      console.error('[TikTok Email] Email sending failed:', error.message);
      return {
        success: false,
        method: 'email',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Combined reporting: both web and email
  async reportToTikTok(videoUrl, reportData) {
    console.log(`[TikTok Real] Starting dual reporting for: ${videoUrl}`);
    
    const results = {
      webResult: null,
      emailResult: null,
      timestamp: new Date().toISOString()
    };

    // Execute both reporting methods simultaneously
    const [webResult, emailResult] = await Promise.allSettled([
      this.reportToTikTokWeb(videoUrl, reportData),
      this.reportToTikTokEmail(videoUrl, reportData)
    ]);

    results.webResult = webResult.status === 'fulfilled' ? webResult.value : { success: false, error: webResult.reason };
    results.emailResult = emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason };

    // Log the results
    this.reportHistory.push({
      videoUrl,
      reportData,
      results,
      timestamp: new Date().toISOString()
    });

    console.log('[TikTok Real] Dual reporting completed:', results);
    return results;
  }

  // Map classification to TikTok report reasons
  mapToTikTokReason(classification) {
    const reasonMap = {
      'false': 'False information',
      'misleading': 'Misleading information',
      'harmful': 'Harmful content',
      'hate': 'Hate speech',
      'violence': 'Violent content'
    };
    return reasonMap[classification] || 'False information';
  }

  // Get reporting history
  getReportHistory() {
    return this.reportHistory;
  }

  // Close browser when done
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

const tiktokRealReporting = new TikTokRealReportingService();

// Routes

// Real TikTok reporting endpoint
router.post('/report', async (req, res) => {
  try {
    const { videoUrl, reportData } = req.body;
    
    if (!videoUrl || !reportData) {
      return res.status(400).json({ 
        error: 'Missing required fields: videoUrl, reportData' 
      });
    }

    console.log(`[TikTok Real] Processing report for: ${videoUrl}`);
    const results = await tiktokRealReporting.reportToTikTok(videoUrl, reportData);
    
    res.json({ 
      success: true, 
      results,
      message: 'Real TikTok reporting completed via web automation and email'
    });
  } catch (error) {
    console.error('[TikTok Real] Reporting failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get reporting history
router.get('/history', (req, res) => {
  try {
    const history = tiktokRealReporting.getReportHistory();
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'TikTok Real Reporting',
    methods: ['web_automation', 'email'],
    timestamp: new Date().toISOString()
  });
});

// Cleanup on server shutdown
process.on('SIGINT', async () => {
  console.log('[TikTok Real] Shutting down browser...');
  await tiktokRealReporting.closeBrowser();
  process.exit(0);
});

module.exports = router;
