#!/usr/bin/env node
/**
 * 🚀 Mini-Meish Self-Iterating Deployment Loop
 * Inspired by Universal Self-Iterating Deployment Loop Agent
 *
 * Deploys to Vercel, monitors build, auto-fixes common errors, retries.
 * Usage: node deploy-loop.js [--max-cycles N] [--prod]
 */
const { execSync } = require('child_process');

const PROJECT_ID = 'prj_PZbKk5mywAPRWy8RIyVbCnbVhFgy';
const MAX_CYCLES = parseInt(process.argv.find(a => a.startsWith('--max-cycles='))?.split('=')[1] || '5');
const IS_PROD = process.argv.includes('--prod');

const LOG = {
  info:  (m) => console.log(`   ${m}`),
  ok:    (m) => console.log(`✅ ${m}`),
  warn:  (m) => console.log(`⚠️  ${m}`),
  err:   (m) => console.log(`❌ ${m}`),
  grade: (g, m) => console.log(`📊 Self-Grade: ${g === 'SUCCESS' ? '✅' : g === 'PROGRESS' ? '🟡' : '❌'} ${g} — ${m}`),
  sep:   () => console.log('─'.repeat(60)),
};

function run(cmd, label) {
  LOG.info(`${label}...`);
  try {
    const out = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd(), timeout: 300000 });
    LOG.ok(`${label} succeeded`);
    return { ok: true, out };
  } catch (e) {
    LOG.err(`${label} failed`);
    return { ok: false, out: (e.stdout || '') + '\n' + (e.stderr || '') };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ERROR PATTERN → FIX MAP ──────────────────────────────────────
const FIXES = [
  {
    pattern: /pnpm-lock\.yaml.*not up to date|ERR_PNPM_OUTDATED_LOCKFILE/i,
    label: 'Stale pnpm-lock.yaml detected',
    fix: () => {
      run('git rm -f pnpm-lock.yaml 2>nul || del pnpm-lock.yaml 2>nul', 'Removing pnpm-lock.yaml');
      run('git add -A && git commit -m "fix: remove stale pnpm-lock.yaml" && git push origin main', 'Push lockfile removal');
      return true;
    }
  },
  {
    pattern: /next build.*failed|Cannot find module.*next/i,
    label: 'Vercel trying Next.js build on static site',
    fix: () => {
      const fs = require('fs');
      const vj = { "$schema": "https://openapi.vercel.sh/vercel.json", framework: null, buildCommand: "", installCommand: "", outputDirectory: "public" };
      fs.writeFileSync('vercel.json', JSON.stringify(vj, null, 2) + '\n');
      run('git add vercel.json && git commit -m "fix: force static site config" && git push origin main', 'Push vercel.json fix');
      return true;
    }
  },
  {
    pattern: /install.*exited with 1|ENOENT|missing.*dependencies/i,
    label: 'Dependency install failure',
    fix: () => {
      run('npm install', 'Reinstall deps');
      run('git add -A && git commit -m "fix: update deps" --allow-empty && git push origin main', 'Push dep fix');
      return true;
    }
  },
  {
    pattern: /outputDirectory.*not found|no output directory/i,
    label: 'Output directory missing',
    fix: () => {
      const fs = require('fs');
      if (!fs.existsSync('public')) fs.mkdirSync('public');
      if (!fs.existsSync('public/index.html')) {
        LOG.err('public/index.html missing — cannot auto-fix');
        return false;
      }
      run('git add -A && git commit -m "fix: ensure public/ exists" --allow-empty && git push origin main', 'Push output dir fix');
      return true;
    }
  },
  {
    pattern: /frozen.lockfile|lockfile.*specifiers/i,
    label: 'Frozen lockfile mismatch',
    fix: () => {
      run('git rm -f pnpm-lock.yaml 2>nul || true', 'Remove old lockfile');
      run('git add -A && git commit -m "fix: remove conflicting lockfile" && git push origin main', 'Push lockfile cleanup');
      return true;
    }
  }
];

function diagnose(output) {
  for (const f of FIXES) {
    if (f.pattern.test(output)) {
      LOG.warn(`Diagnosed: ${f.label}`);
      return f;
    }
  }
  return null;
}

// ── DEPLOYMENT VIA CLI ──────────────────────────────────────────
function deployViaCLI() {
  const prodFlag = IS_PROD ? '--prod' : '';
  const result = run(`vercel ${prodFlag} --yes 2>&1`, `Deploying ${IS_PROD ? 'to production' : 'preview'}`);
  if (result.ok) {
    // Extract URL from output
    const lines = result.out.trim().split('\n');
    const url = lines[lines.length - 1]?.trim();
    return { ok: true, url, out: result.out };
  }
  return { ok: false, url: null, out: result.out };
}

// ── GIT-TRIGGERED DEPLOYMENT (push & wait) ──────────────────────
function triggerGitDeploy() {
  // Make a trivial commit or just push to trigger Vercel webhook
  const pushResult = run('git push origin main 2>&1', 'Push to trigger Vercel deploy');
  return pushResult.ok;
}

// ── HEALTH CHECK ────────────────────────────────────────────────
async function healthCheck(url) {
  if (!url) return false;
  const cleanUrl = url.replace(/^https?:\/\//, '');
  const fullUrl = `https://${cleanUrl}`;
  LOG.info(`Health check: ${fullUrl}`);
  try {
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(15000) });
    const ok = res.ok;
    if (ok) LOG.ok(`Health check passed (${res.status})`);
    else LOG.err(`Health check failed (${res.status})`);
    return ok;
  } catch (e) {
    LOG.err(`Health check error: ${e.message}`);
    return false;
  }
}

// ── MAIN LOOP ───────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🚀 Mini-Meish Self-Iterating Deployment Loop');
  console.log('═'.repeat(60));
  console.log(`🎯 Project: ${PROJECT_ID}`);
  console.log(`🔄 Max cycles: ${MAX_CYCLES}`);
  console.log(`🌐 Target: ${IS_PROD ? 'PRODUCTION' : 'Preview'}`);
  console.log('═'.repeat(60));

  const results = [];

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`\n🔄 CYCLE ${cycle}/${MAX_CYCLES}`);
    LOG.sep();

    // Step 1: Verify local files
    LOG.info('Checking local project...');
    const fs = require('fs');
    if (!fs.existsSync('public/index.html')) {
      LOG.err('public/index.html not found! Cannot deploy.');
      results.push({ cycle, grade: 'FAILURE', reason: 'Missing public/index.html' });
      break;
    }
    if (!fs.existsSync('vercel.json')) {
      LOG.warn('vercel.json missing — creating static site config...');
      fs.writeFileSync('vercel.json', JSON.stringify({ framework: null, buildCommand: "", installCommand: "", outputDirectory: "public" }, null, 2) + '\n');
      run('git add vercel.json && git commit -m "fix: add vercel.json" && git push origin main', 'Push vercel.json');
    }
    LOG.ok('Local project structure valid');

    // Step 2: Deploy
    LOG.info('Deploying to Vercel...');
    const deploy = deployViaCLI();

    if (deploy.ok && deploy.url) {
      LOG.ok(`Deployed: ${deploy.url}`);

      // Step 3: Wait a moment for it to propagate
      LOG.info('Waiting 15s for deployment to propagate...');
      await sleep(15000);

      // Step 4: Health check
      const healthy = await healthCheck(deploy.url);
      if (healthy) {
        LOG.grade('SUCCESS', 'App is live and healthy!');
        console.log('');
        console.log('═'.repeat(60));
        console.log(`🎉 SUCCESS! App is live at: ${deploy.url}`);
        console.log('═'.repeat(60));
        results.push({ cycle, grade: 'SUCCESS', url: deploy.url });
        break;
      } else {
        LOG.grade('PROGRESS', 'Deployed but health check failed — retrying');
        results.push({ cycle, grade: 'PROGRESS', reason: 'Health check failed' });

        // Wait more and retry health check
        LOG.info('Waiting 30s more...');
        await sleep(30000);
        const retry = await healthCheck(deploy.url);
        if (retry) {
          LOG.grade('SUCCESS', 'Health check passed on retry!');
          console.log(`🎉 SUCCESS! App is live at: ${deploy.url}`);
          results.push({ cycle, grade: 'SUCCESS', url: deploy.url });
          break;
        }
      }
    } else {
      LOG.err('Deployment failed');
      LOG.info('Analyzing error output...');

      // Step 5: Diagnose and auto-fix
      const fix = diagnose(deploy.out);
      if (fix) {
        LOG.info(`Applying fix: ${fix.label}`);
        const fixed = fix.fix();
        if (fixed) {
          LOG.grade('PROGRESS', `Applied fix: ${fix.label}. Retrying next cycle.`);
          results.push({ cycle, grade: 'PROGRESS', reason: `Auto-fixed: ${fix.label}` });
          await sleep(5000);
          continue;
        }
      }

      // No known fix — log the error
      LOG.grade('FAILURE', 'Build failed with unknown error');
      console.log('\n📋 Build output (last 20 lines):');
      deploy.out.split('\n').slice(-20).forEach(l => console.log('   ' + l));
      results.push({ cycle, grade: 'FAILURE', reason: 'Unknown build error' });
    }
  }

  // ── SUMMARY ─────────────────────────────────────────────────────
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📋 DEPLOYMENT SUMMARY');
  console.log('═'.repeat(60));
  results.forEach(r => {
    const icon = r.grade === 'SUCCESS' ? '✅' : r.grade === 'PROGRESS' ? '🟡' : '❌';
    console.log(`   ${icon} Cycle ${r.cycle}: ${r.grade} ${r.url ? '→ ' + r.url : r.reason ? '— ' + r.reason : ''}`);
  });
  console.log('');

  const success = results.some(r => r.grade === 'SUCCESS');
  if (!success) {
    console.log('⚠️  ESCALATION: All cycles exhausted without success.');
    console.log('💡 Manual steps:');
    console.log('   1. Check Vercel dashboard: https://vercel.com/dashboard');
    console.log('   2. Review build logs for this project');
    console.log('   3. Try: vercel --prod --yes');
    console.log('   4. Verify vercel.json settings');
    process.exit(1);
  }
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
