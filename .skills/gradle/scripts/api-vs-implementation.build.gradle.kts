dependencies {
  // api: 下游模块编译时可见（domain 的接口被 feature 直接使用）
  api(projects.core.domain)

  // implementation: 下游模块不可见（减少重编译传播）
  implementation(projects.core.data)
}
