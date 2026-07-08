'use strict';
/*
 * electron-builder afterPack hook.
 *
 * When there's no Apple Developer certificate, electron-builder skips macOS
 * signing entirely, leaving the bundle's helpers with an inconsistent/absent
 * signature. We give the whole bundle a consistent ad-hoc signature
 * (--sign -) so that, once the user clears Gatekeeper on first launch, the
 * helper/renderer processes run and the window appears.
 *
 * Deliberately NO hardened runtime here: a hardened-runtime app that isn't
 * notarized is *killed* by macOS when quarantined (worse than unsigned). The
 * hardened runtime + entitlements in package.json apply only to the proper,
 * notarized signing path (when a real certificate is configured), where
 * electron-builder's own signing step runs after this and takes precedence.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, productFilename + '.app');

  console.log('  afterPack: ad-hoc signing ' + appPath);
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    console.log('  afterPack: ad-hoc signature applied');
  } catch (e) {
    // Non-darwin build hosts (or missing codesign) just skip this.
    console.warn('  afterPack: ad-hoc signing skipped (' + e.message + ')');
  }
};
