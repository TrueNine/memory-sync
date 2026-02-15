<template>
  <view class="page">
    <view class="header">
      <text class="title">{{ title }}</text>
    </view>

    <view class="content">
      <button class="btn" @click="handleClick">{{ buttonText }}</button>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <view class="platform-info">
      <text>微信小程序</text>
    </view>
    <!-- #endif -->

    <!-- #ifdef MP-ALIPAY -->
    <view class="platform-info">
      <text>支付宝小程序</text>
    </view>
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <view class="platform-info">
      <text>H5 网页</text>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'

const title = ref('页面标题')
const buttonText = ref('点击按钮')

onLoad((options) => {
  console.log('页面参数:', options)
})

onShow(() => {
  console.log('页面显示')
})

function handleClick() {
  uni.showModal({
    title: '提示',
    content: '确认操作？',
    success: (res) => {
      if (res.confirm) {
        uni.showToast({ title: '已确认', icon: 'success' })
      }
    }
  })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding: 20rpx;
}

.header {
  padding: 40rpx 0;
  text-align: center;

  .title {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
  }
}

.content {
  padding: 40rpx;
  background-color: #fff;
  border-radius: 16rpx;

  .btn {
    width: 100%;
    height: 88rpx;
    line-height: 88rpx;
    background-color: #07c160;
    color: #fff;
    font-size: 32rpx;
    border-radius: 8rpx;
    border: none;

    /* #ifdef MP-ALIPAY */
    background-color: #1677ff;
    /* #endif */

    /* #ifdef H5 */
    cursor: pointer;
    /* #endif */
  }
}

.platform-info {
  margin-top: 40rpx;
  text-align: center;
  color: #999;
  font-size: 24rpx;
}
</style>
