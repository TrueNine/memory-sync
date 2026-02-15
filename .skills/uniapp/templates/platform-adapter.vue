<template>
  <view class="platform-adapter">
    <!-- 微信小程序 -->
    <!-- #ifdef MP-WEIXIN -->
    <button class="share-btn" open-type="share">
      <slot name="weixin">微信分享</slot>
    </button>
    <!-- #endif -->

    <!-- 支付宝小程序 -->
    <!-- #ifdef MP-ALIPAY -->
    <button class="share-btn" open-type="share">
      <slot name="alipay">支付宝分享</slot>
    </button>
    <!-- #endif -->

    <!-- H5 -->
    <!-- #ifdef H5 -->
    <button class="share-btn" @click="handleWebShare">
      <slot name="h5">网页分享</slot>
    </button>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
// #ifdef H5
function handleWebShare() {
  if (navigator.share) {
    navigator.share({
      title: document.title,
      url: window.location.href
    })
  } else {
    uni.showToast({
      title: '请手动复制链接分享',
      icon: 'none'
    })
  }
}
// #endif
</script>

<style lang="scss" scoped>
.platform-adapter {
  .share-btn {
    padding: 20rpx 40rpx;
    background-color: #07c160;
    color: #fff;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;

    /* #ifdef MP-ALIPAY */
    background-color: #1677ff;
    /* #endif */

    /* #ifdef H5 */
    background-color: #409eff;
    cursor: pointer;
    /* #endif */
  }
}
</style>
