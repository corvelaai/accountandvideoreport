const express = require('express');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// TikTok Real Reporting Service
class TikTokRealReportingService {
  constructor() {
    this.emailTransporter = this.setupEmailTransporter();
    this.browser = null;
    this.reportHistory = [];
    this.caseRoot = path.resolve(process.env.TIKTOK_CASE_ROOT || './tiktok-cases');
    fs.mkdirSync(this.caseRoot, { recursive: true });
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

  normalizeTargetUrl(targetUrl, kind = 'video') {
    const value = String(targetUrl || '').trim();
    if (!/^https?:\/\/(www\.)?tiktok\.com\//i.test(value)) throw new Error('targetUrl must be a TikTok URL');
    if (kind === 'video' && !/\/video\//i.test(value)) throw new Error('Video targetUrl must be a TikTok video URL');
    if (kind === 'account' && !/\/@[^/?#]+/i.test(value)) throw new Error('Account targetUrl must be a TikTok profile URL');
    return value;
  }

  createCase(kind, targetUrl, reportData = {}) {
    const normalized = this.normalizeTargetUrl(targetUrl, kind);
    const caseId = `TT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const dir = path.join(this.caseRoot, caseId);
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      caseId, kind, targetUrl: normalized,
      createdAt: new Date().toISOString(),
      reportData: { ...reportData },
      status: 'created'
    };
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(record, null, 2));
    return { caseId, caseDirectory: dir, record };
  }

  async openOfficialPortal() {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    await page.goto('https://safety-enforcement.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page;
  }

  async reportToTikTokAccount(accountUrl, reportData) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    try {
      console.log(`[TikTok Web] Starting account report for: ${accountUrl}`);
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(accountUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(2500);
      const moreSelectors = ['[data-e2e="user-more"]','[data-e2e="more-btn"]','[aria-label="More"]','button[aria-label="More options"]','[data-testid="more-button"]'];
      let opened = false;
      for (const selector of moreSelectors) {
        try { await page.waitForSelector(selector,{timeout:2500}); await page.click(selector); opened=true; break; } catch (_) {}
      }
      if (!opened) throw new Error('Could not find account options button');
      await page.waitForTimeout(1000);
      const reportSelectors = ['text/Report','[data-e2e="report-button"]','button[aria-label="Report"]'];
      let reported = false;
      for (const selector of reportSelectors) {
        try { await page.waitForSelector(selector,{timeout:2500}); await page.click(selector); reported=true; break; } catch (_) {}
      }
      if (!reported) throw new Error('Could not find account report option');
      await page.waitForTimeout(1500);
      const reason = this.mapToTikTokReason(reportData.classification);
      let reasonSelected = false;
      for (const selector of [`text/${reason}`,'input[type="radio"]']) {
        try { await page.waitForSelector(selector,{timeout:2500}); await page.click(selector); reasonSelected=true; break; } catch (_) {}
      }
      if (!reasonSelected) throw new Error('Could not select account report reason');
      try { await page.waitForSelector('textarea',{timeout:2000}); await page.type('textarea', String(reportData.summary || '').slice(0,1500)); } catch (_) {}
      const submitSelectors=['button:has-text("Submit")','[data-e2e="submit-report"]','button[type="submit"]'];
      let submitted=false;
      for (const selector of submitSelectors) {
        try { await page.waitForSelector(selector,{timeout:2500}); await page.click(selector); submitted=true; break; } catch (_) {}
      }
      if (!submitted) throw new Error('Could not submit account report');
      await page.waitForTimeout(2000);
      return { success:true, method:'web_automation', targetType:'account', accountUrl, timestamp:new Date().toISOString() };
    } catch (error) {
      return { success:false, method:'web_automation', targetType:'account', accountUrl, error:error.message, timestamp:new Date().toISOString() };
    } finally { await page.close(); }
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
        to: (process.env.TIKTOK_REPORT_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean),
        subject: `URGENT: Government Misinformation Report - ${reportData.platform} Content Violation`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <h2 style="color: #e74c3c; margin: 0;">🚨 GOVERNMENT MISINFORMATION REPORT</h2>
                  <p style="margin: 10px 0 0 0; color: #666;">${reportData.reportingEntity || 'Official reporting submission'}</p>
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
                    <p><strong>Reporting Organization:</strong> ${reportData.reportingEntity || 'Not specified'}</p>
                    <p><strong>Contact Email:</strong> ${reportData.reportingContact || process.env.GOVERNMENT_EMAIL_USER || 'Not specified'}</p>
                    <p><strong>Authority:</strong> ${reportData.authorityBasis || 'Platform-policy report'}</p>
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

  // Combined reporting: preserves the original web + optional email workflow.
  async reportToTikTok(targetUrl, reportData = {}) {
    const targetType = reportData.targetType === 'account' ? 'account' : 'video';
    const results = { targetType, targetUrl, webResult: null, emailResult: null, timestamp: new Date().toISOString() };
    const webPromise = targetType === 'account'
      ? this.reportToTikTokAccount(targetUrl, reportData)
      : this.reportToTikTokWeb(targetUrl, reportData);
    const emailEnabled = process.env.TIKTOK_EMAIL_REPORTING === 'true' && String(process.env.TIKTOK_REPORT_RECIPIENTS || '').trim();
    const promises = [webPromise];
    if (emailEnabled) promises.push(this.reportToTikTokEmail(targetUrl, reportData));
    const settled = await Promise.allSettled(promises);
    results.webResult = settled[0].status === 'fulfilled' ? settled[0].value : { success:false, error:String(settled[0].reason) };
    results.emailResult = emailEnabled ? (settled[1].status === 'fulfilled' ? settled[1].value : { success:false, error:String(settled[1].reason) }) : { success:false, skipped:true, reason:'TIKTOK_EMAIL_REPORTING is not enabled' };
    this.reportHistory.push({ targetUrl, targetType, reportData, results, timestamp:new Date().toISOString() });
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

  getReportHistory() { return this.reportHistory; }

  async closeBrowser() {
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }
}

const tiktokRealReporting = new TikTokRealReportingService();

  // Routes

// Report a TikTok video or account using the existing web workflow.
router.post('/report', async (req, res) => {
  try {
    const { videoUrl, accountUrl, targetUrl, reportData = {} } = req.body || {};
    const kind = reportData.targetType === 'account' || accountUrl ? 'account' : 'video';
    const url = targetUrl || accountUrl || videoUrl;
    if (!url) return res.status(400).json({ error: 'Missing targetUrl/videoUrl/accountUrl' });
    const caseInfo = tiktokRealReporting.createCase(kind, url, reportData);
    const results = await tiktokRealReporting.reportToTikTok(url, { ...reportData, targetType: kind });
    fs.writeFileSync(path.join(caseInfo.caseDirectory, 'results.json'), JSON.stringify(results, null, 2));
    res.json({ success: Boolean(results.webResult?.success), caseId: caseInfo.caseId, results, message: `${kind} reporting completed; see results for the actual submission status.` });
  } catch (error) {
    console.error('[TikTok Real] Reporting failed:', error);
    res.status(500).json({ success:false, error:error.message });
  }
});

// Prepare a case for the official TikTok Safety Enforcement Tool.
router.post('/official/case', (req,res) => {
  try {
    const body=req.body||{};
    const kind=body.kind==='account'?'account':'video';
    const targetUrl=body.targetUrl || body.accountUrl || body.videoUrl;
    if(!targetUrl) return res.status(400).json({error:'Missing targetUrl'});
    const caseInfo=tiktokRealReporting.createCase(kind,targetUrl,body);
    const portal='https://safety-enforcement.tiktok.com/';
    res.status(201).json({success:true,caseId:caseInfo.caseId,caseDirectory:caseInfo.caseDirectory,portalUrl:portal,message:'Case prepared. An authorized official must complete the official submission.'});
  } catch(error) { res.status(400).json({success:false,error:error.message}); }
});

router.post('/official/open', async (req,res) => {
  try { await tiktokRealReporting.openOfficialPortal(); res.json({success:true,portalUrl:'https://safety-enforcement.tiktok.com/'}); }
  catch(error) { res.status(500).json({success:false,error:error.message,portalUrl:'https://safety-enforcement.tiktok.com/'}); }
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
