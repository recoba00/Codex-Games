import { SafeArea, Screen, graniteEvent } from '@apps-in-toss/web-framework';
import { connectToss } from './adapter.js';

connectToss({ SafeArea, Screen, graniteEvent }, window.SoulLinkHost);
document.documentElement.dataset.host = 'toss';
