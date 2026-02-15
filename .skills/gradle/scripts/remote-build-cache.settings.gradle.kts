// settings.gradle.kts — 远程 Build Cache 配置（CI/CD 环境）
buildCache {
  local {
    isEnabled = true
  }
  remote<HttpBuildCache> {
    url = uri("https://cache.example.com/")
    isPush = System.getenv("CI") != null
    credentials {
      username = System.getenv("CACHE_USER")
      password = System.getenv("CACHE_PASS")
    }
  }
}
