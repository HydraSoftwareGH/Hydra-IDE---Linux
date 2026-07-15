// Configuración del entorno de Monaco: de dónde cargar los web workers.
// Va en archivo externo (no inline) para cumplir la CSP (script-src 'self').
// Los workers se cargan vía data: URL que importa workerMain.js del mismo
// origen (http://127.0.0.1), habilitando el IntelliSense de JS/TS/JSON/CSS/HTML.
self.MonacoEnvironment = {
  getWorkerUrl: function () {
    var base = location.origin + '/vendor/monaco/';
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
      "self.MonacoEnvironment={baseUrl:'" + base + "'};" +
      "importScripts('" + base + "vs/base/worker/workerMain.js');"
    );
  },
};
