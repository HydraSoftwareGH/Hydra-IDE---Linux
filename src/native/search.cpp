// Núcleo en C++ del editor — expuesto a Electron/Node vía N-API (node-addon-api).
//
// N-API es una ABI estable: un addon compilado funciona en distintas versiones
// de Node y de Electron sin recompilar. Por eso es el enfoque más cómodo para
// integrar C++ en una app Electron.
//
// Aquí implementamos búsqueda de texto recursiva sobre una carpeta. La I/O de
// archivos y el escaneo de líneas se hacen enteramente en C++.

#include <napi.h>
#include <string>
#include <fstream>
#include <filesystem>
#include <algorithm>

namespace fs = std::filesystem;

// Convierte a minúsculas para una comparación case-insensitive sencilla.
static std::string toLower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(),
                 [](unsigned char c) { return std::tolower(c); });
  return s;
}

// Extensiones que consideramos "texto" para no intentar leer binarios.
static bool isTextFile(const fs::path& p) {
  static const char* exts[] = {
    ".txt", ".md", ".js", ".ts", ".jsx", ".tsx", ".json", ".html", ".css",
    ".c", ".cc", ".cpp", ".h", ".hpp", ".py", ".java", ".go", ".rs",
    ".sh", ".yml", ".yaml", ".xml", ".gyp", ".gitignore", ".cs", ".php", ".rb"
  };
  std::string ext = toLower(p.extension().string());
  for (const char* e : exts) {
    if (ext == e) return true;
  }
  return false;
}

// Carpetas que ignoramos al recorrer (ruido / muy pesadas).
static bool isIgnoredDir(const std::string& name) {
  return name == "node_modules" || name == ".git" ||
         name == "build" || name == "dist" || name == ".cache";
}

// searchInDirectory(rootDir, query) -> Array<{ file, line, text }>
// Recorre rootDir recursivamente y devuelve cada línea que contiene query.
Napi::Value SearchInDirectory(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Uso: searchInDirectory(rootDir, query)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string rootDir = info[0].As<Napi::String>();
  std::string query = toLower(info[1].As<Napi::String>());

  Napi::Array results = Napi::Array::New(env);
  uint32_t count = 0;

  if (query.empty()) return results;

  std::error_code ec;
  auto it = fs::recursive_directory_iterator(
      rootDir, fs::directory_options::skip_permission_denied, ec);
  if (ec) return results;  // ruta inválida -> sin resultados

  for (auto end = fs::recursive_directory_iterator(); it != end; it.increment(ec)) {
    if (ec) { ec.clear(); continue; }
    const fs::directory_entry& entry = *it;

    if (entry.is_directory(ec)) {
      if (isIgnoredDir(entry.path().filename().string())) {
        it.disable_recursion_pending();  // no entrar en esta carpeta
      }
      continue;
    }

    if (!entry.is_regular_file(ec) || !isTextFile(entry.path())) continue;

    std::ifstream file(entry.path());
    if (!file.is_open()) continue;

    std::string line;
    int lineNumber = 0;
    while (std::getline(file, line)) {
      ++lineNumber;
      if (toLower(line).find(query) != std::string::npos) {
        Napi::Object match = Napi::Object::New(env);
        match.Set("file", entry.path().string());
        match.Set("line", lineNumber);
        // Recortamos líneas muy largas para no saturar la UI.
        match.Set("text", line.substr(0, 300));
        results.Set(count++, match);

        if (count >= 1000) return results;  // tope de seguridad
      }
    }
  }

  return results;
}

// Pequeña función extra para confirmar que el addon carga.
Napi::Value Hello(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::String::New(env, "Núcleo C++ activo ✔");
}

// Registro del módulo: define qué funciones ve JavaScript.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("searchInDirectory", Napi::Function::New(env, SearchInDirectory));
  exports.Set("hello", Napi::Function::New(env, Hello));
  return exports;
}

NODE_API_MODULE(hydra_core, Init)
