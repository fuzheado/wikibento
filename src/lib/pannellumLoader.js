/**
 * Pannellum loader — lazy-loads the vendored IIFE build (src/vendor/pannellum.js)
 * as a classic <script> so the UMD global `window.pannellum` is set.
 * Singleton: multiple 360° widgets share one script tag.
 */
import pannellumUrl from '../vendor/pannellum.js?url';

let pannellumPromise = null;

export function loadPannellum() {
  if (!pannellumPromise) {
    pannellumPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = pannellumUrl;
      s.async = true;
      s.onload = () => resolve(window.pannellum);
      s.onerror = () => {
        pannellumPromise = null; // allow retry
        reject(new Error('Failed to load the panorama viewer (pannellum)'));
      };
      document.head.appendChild(s);
    });
  }
  return pannellumPromise;
}
