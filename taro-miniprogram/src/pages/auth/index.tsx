import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { Screen } from "../../components/ui";
import { api, ApiError, message } from "../../core/api";
import { setSession } from "../../core/session";
import { tab } from "../../core/navigation";
import type { Auth } from "../../core/models";
export default function AuthPage() {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [email, setEmail] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(wechat = false) {
    if (busy) return;
    if (!wechat && (!username.trim() || password.length < 8)) {
      setError("请填写用户名和至少 8 位密码");
      return;
    }
    if (
      !wechat &&
      register &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || confirm !== password)
    ) {
      setError("请填写有效邮箱，并确认两次密码一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let result: Auth;
      if (wechat) {
        const { code } = await Taro.login();
        if (!code) throw new Error("未取得微信登录凭证，请重试");
        result = await api<Auth>("/auth/wechat/callback", "POST", { code }, false);
      } else
        result = await api<Auth>(
          register ? "/auth/register" : "/auth/login",
          "POST",
          { username: username.trim(), password, ...(register ? { email: email.trim() } : {}) },
          false,
        );
      setSession(result);
      setPassword("");
      setConfirm("");
      Taro.showToast({ title: "登录成功", icon: "success" });
      if (Taro.getCurrentPages().length > 1) await Taro.navigateBack();
      else await tab("member");
    } catch (e) {
      setError(
        wechat && e instanceof ApiError && e.status === 500
          ? "微信登录暂不可用，请使用账号登录；服务端需配置匹配的 AppID 和 AppSecret。"
          : message(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View className="auth-intro">
        <View className="brand">{register ? "开始你的全栈旅程" : "欢迎回来"}</View>
        <Text className="muted">收藏好文章，交流新想法，记录每一次成长</Text>
      </View>
      <View className="panel" onClick={(e) => e.stopPropagation()}>
        <View className="section-title">{register ? "注册账号" : "账号登录"}</View>
        <View className="space" />
        <Text className="label">用户名</Text>
        <Input
          className="field"
          value={username}
          maxlength={32}
          placeholder="请输入用户名"
          onInput={(e) => setUsername(e.detail.value)}
        />
        {register && (
          <>
            <Text className="label">邮箱</Text>
            <Input
              className="field"
              value={email}
              maxlength={255}
              placeholder="用于账号联系"
              onInput={(e) => setEmail(e.detail.value)}
            />
          </>
        )}
        <Text className="label">密码</Text>
        <Input
          className="field"
          password
          value={password}
          maxlength={128}
          placeholder="至少 8 位"
          onInput={(e) => setPassword(e.detail.value)}
        />
        {register && (
          <>
            <Text className="label">确认密码</Text>
            <Input
              className="field"
              password
              value={confirm}
              maxlength={128}
              placeholder="再次输入密码"
              onInput={(e) => setConfirm(e.detail.value)}
            />
          </>
        )}
        {error && <View className="error">{error}</View>}
        <Button className="button" loading={busy} disabled={busy} onClick={() => void login()}>
          {register ? "注册并登录" : "登录"}
        </Button>
        <View className="center">
          <Button
            className="link"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "已有账号？去登录" : "还没有账号？注册"}
          </Button>
        </View>
      </View>
      <Button
        className="button secondary"
        loading={busy}
        disabled={busy}
        onClick={() => void login(true)}
      >
        微信快捷登录
      </Button>
      <Text className="muted">
        首次微信登录会创建独立会员。已有网站账号请使用密码登录；本期不合并账号。登录凭据仅用于本应用会话，可在设置中退出清除。
      </Text>
    </Screen>
  );
}
