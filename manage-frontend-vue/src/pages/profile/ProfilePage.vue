<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { NAlert, NAvatar, NButton, NForm, NFormItem, NInput, NSpin, useMessage } from 'naive-ui'
import { reactive, ref, watch } from 'vue'
import { uploadFile } from '@/api/attachments'
import { getMyProfile, updateMyProfile } from '@/api/me'
import { pinia } from '@/app/pinia'
import { fileUrl } from '@/lib/fileUrl'
import { useAuthStore } from '@/stores/auth'
import type { ProfileUpdateRequest } from '@/types/common'

const auth=useAuthStore(pinia);const client=useQueryClient();const message=useMessage();const profile=useQuery({queryKey:['me','profile'],queryFn:getMyProfile})
const form=reactive({nickname:'',email:'',avatar:''});const dirty=ref(false);const input=ref<HTMLInputElement|null>(null)
watch(profile.data,(value)=>{if(value)Object.assign(form,{nickname:value.nickname,email:value.email??'',avatar:value.avatar??''})},{immediate:true})
watch(form,()=>{if(profile.data.value)dirty.value=true},{deep:true})
async function chooseAvatar(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{form.avatar=fileUrl((await uploadFile(file)).url);dirty.value=true;message.success('头像上传完成')}catch(e){message.error(e instanceof Error?e.message:'上传失败')}finally{(event.target as HTMLInputElement).value=''}}
const mutation=useMutation({mutationFn:()=>{const payload:ProfileUpdateRequest={nickname:form.nickname.trim(),email:form.email.trim(),avatar:form.avatar||null};return updateMyProfile(payload)},onSuccess:async(user)=>{auth.setUser(user);dirty.value=false;message.success('资料已保存');await client.invalidateQueries({queryKey:['me','profile']})},onError:e=>message.error(e instanceof Error?e.message:'保存失败')})
</script>
<template><section class="content-card card-padding profile-card"><h2 class="section-title">个人资料</h2><p class="section-desc">设置读者看到的昵称、头像及联系邮箱。</p><NSpin :show="profile.isPending.value"><NForm label-placement="top"><NFormItem label="头像"><div class="avatar-row"><NAvatar round :size="72" :src="fileUrl(form.avatar)||undefined">{{form.nickname.slice(0,1)||'U'}}</NAvatar><input ref="input" hidden type="file" accept="image/*" @change="chooseAvatar"><NButton @click="input?.click()">上传头像</NButton></div></NFormItem><NFormItem label="昵称"><NInput v-model:value="form.nickname" maxlength="32"/></NFormItem><NFormItem label="邮箱"><NInput v-model:value="form.email" type="text" maxlength="255" placeholder="name@example.com"/></NFormItem><NFormItem label="用户名（只读）"><NInput :value="profile.data.value?.username??auth.user?.username" disabled/></NFormItem><div class="toolbar"><NButton type="primary" :loading="mutation.isPending.value" :disabled="!dirty" @click="mutation.mutate()">保存资料</NButton><NButton :disabled="!dirty" @click="profile.data.value&&Object.assign(form,{nickname:profile.data.value.nickname,email:profile.data.value.email??'',avatar:profile.data.value.avatar??''});dirty=false">撤销修改</NButton></div></NForm></NSpin><NAlert v-if="profile.isError.value" type="error">资料读取失败 <NButton text @click="profile.refetch()">重试</NButton></NAlert></section></template>
<style scoped>.profile-card{max-width:760px}.section-title{margin:0;font-size:17px}.section-desc{margin:6px 0 18px;color:#748196;font-size:13px}.avatar-row{display:flex;align-items:center;gap:14px}</style>
