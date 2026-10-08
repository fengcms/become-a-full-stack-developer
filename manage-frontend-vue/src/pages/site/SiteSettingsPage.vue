<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { reactive, watch } from 'vue'
import { getAdminSiteSettings, updateSiteSettings } from '@/api/site'
import PageHeader from '@/components/PageHeader.vue'
import type { SiteSettingUpdate } from '@/types/common'

const client=useQueryClient();const message=useMessage()
const query=useQuery({queryKey:['site','settings'],queryFn:getAdminSiteSettings})
const form=reactive({siteName:'',siteTitle:'',siteDescription:'',siteKeywords:'',logoUrl:'',copyright:''})
watch(query.data,(value)=>{if(value)Object.assign(form,{siteName:value.siteName,siteTitle:value.siteTitle??'',siteDescription:value.siteDescription,siteKeywords:value.siteKeywords??'',logoUrl:value.logoUrl??'',copyright:value.copyright??''})},{immediate:true})
const mutation=useMutation({mutationFn:()=>{const payload:SiteSettingUpdate={siteName:form.siteName.trim(),siteTitle:form.siteTitle||null,siteDescription:form.siteDescription,siteKeywords:form.siteKeywords||null,logoUrl:form.logoUrl||null,copyright:form.copyright||null};return updateSiteSettings(payload)},onSuccess:async()=>{message.success('站点设置已保存');await client.invalidateQueries({queryKey:['site']})},onError:(error)=>message.error(error instanceof Error?error.message:'保存失败')})
</script>
<template><section class="page-content"><PageHeader title="站点设置" description="维护公开站点品牌、SEO 信息和版权内容"/><section class="content-card card-padding settings-card"><NForm label-placement="top"><NFormItem label="站点名称"><NInput v-model:value="form.siteName" maxlength="100"/></NFormItem><NFormItem label="站点标题"><NInput v-model:value="form.siteTitle" maxlength="200"/></NFormItem><NFormItem label="站点描述"><NInput v-model:value="form.siteDescription" type="textarea" :rows="3" maxlength="500"/></NFormItem><NFormItem label="站点关键词"><NInput v-model:value="form.siteKeywords" placeholder="逗号分隔"/></NFormItem><NFormItem label="Logo 地址"><NInput v-model:value="form.logoUrl" placeholder="https://... 或 /files/..."/></NFormItem><NFormItem label="版权信息"><NInput v-model:value="form.copyright"/></NFormItem></NForm><NButton type="primary" :loading="mutation.isPending.value" :disabled="!form.siteName.trim()||!form.siteDescription.trim()" @click="mutation.mutate()">保存设置</NButton></section></section></template>
<style scoped>.settings-card{max-width:820px}</style>
