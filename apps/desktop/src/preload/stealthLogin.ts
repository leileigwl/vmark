import { webFrame } from 'electron';
import {
  buildStealthMainWorldScript,
  decodeFingerprintArg,
  getPlatformFingerprintProfile,
} from '../main/browserStealth';

const profile = decodeFingerprintArg(process.argv) ?? getPlatformFingerprintProfile('weixin');
const script = buildStealthMainWorldScript(profile);

void webFrame.executeJavaScript(script).catch(() => {});
