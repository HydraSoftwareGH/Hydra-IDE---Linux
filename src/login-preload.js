// Preload SOLO para la ventana de login: hace que el entorno se vea como Chrome
// de verdad (sin "Electron") para que Google no bloquee el OAuth.
(function () {
  const VER = '126';
  const brands = [
    { brand: 'Not/A)Brand', version: '8' },
    { brand: 'Chromium', version: VER },
    { brand: 'Google Chrome', version: VER },
  ];
  const uaData = {
    brands,
    mobile: false,
    platform: 'Windows',
    getHighEntropyValues: () => Promise.resolve({
      architecture: 'x86', bitness: '64', brands, mobile: false, model: '',
      platform: 'Windows', platformVersion: '15.0.0', uaFullVersion: VER + '.0.0.0',
      fullVersionList: brands.map((b) => ({ brand: b.brand, version: b.version + '.0.0.0' })),
      wow64: false,
    }),
    toJSON: () => ({ brands, mobile: false, platform: 'Windows' }),
  };

  function define(obj, prop, getter) {
    try { Object.defineProperty(obj, prop, { get: getter, configurable: true }); return true; } catch (e) { return false; }
  }

  // navigator.userAgentData (en prototipo e instancia) sin "Electron".
  define(Navigator.prototype, 'userAgentData', () => uaData);
  define(navigator, 'userAgentData', () => uaData);
  // Chrome real expone window.chrome.
  try { if (!window.chrome) window.chrome = { runtime: {}, app: {} }; } catch (e) {}
  // Sin marcas de automatización.
  define(Navigator.prototype, 'webdriver', () => false);
  define(navigator, 'webdriver', () => false);
})();
