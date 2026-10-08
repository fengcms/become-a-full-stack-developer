<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { reactive, ref } from 'vue'
import { changePassword } from '@/api/me'

const message=useMessage();const busy=ref(false);const form=reactive({oldPassword:'',newPassword:'',confirm:''})
async function submit(){if(form.oldPassword.length<8||form.newPassword.length<8){message.warning('密码至少 8 位');return}if(form.newPassword!==form.confirm){message.warning('两次输入的新密码不一致');return}busy.value=true;try{await changePassword({oldPassword:form.oldPassword,newPassword:form.newPassword});message.success('密码已修改；其他设备的登录状态已失效');Object.assign(form,{oldPassword:'',newPassword:'',confirm:''})}catch(e){message.error(e instanceof Error?e.message:'修改失败')}finally{busy.value=false}}
</script>
<template><section class="content-card card-padding profile-card"><h2 class="section-title">修改密码</h2><p class="section-desc">需要验证旧密码。修改成功后，其他设备将退出登录。</p><NForm label-placement="top" @submit.prevent="submit"><NFormItem label="旧密码"><NInput v-model:value="form.oldPassword" type="password" show-password-on="click" autocomplete="current-password"/></NFormItem><NFormItem label="新密码"><NInput v-model:value="form.newPassword" type="password" show-password-on="click" autocomplete="new-password"/></NFormItem><NFormItem label="确认新密码"><NInput v-model:value="form.confirm" type="password" show-password-on="click" autocomplete="new-password"/></NFormItem><NButton type="primary" :loading="busy" @click="submit">修改密码</NButton></NForm></section></template>
<style scoped>.profile-card{max-width:760px}.section-title{margin:0;font-size:17px}.section-desc{margin:6px 0 18px;color:#748196;font-size:13px}</style>
