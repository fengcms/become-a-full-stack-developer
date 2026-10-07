import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { Avatar, Screen, State } from "../../components/ui";
import { Private } from "../../components/private";
import { useResource } from "../../hooks/data";
import { api, message, uploadImage } from "../../core/api";
import { session, setSession, setUser } from "../../core/session";
import { go } from "../../core/navigation";
import type { User, Auth } from "../../core/models";
function ProfileForm({ mode }: { mode: string }) {
  const result = useResource<User>("/me/profile", true);
  const [nickname, setNickname] = useState(""),
    [email, setEmail] = useState(""),
    [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState(""),
    [oldPassword, setOldPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    isPassword = mode === "password",
    isSetup = mode === "setup";
  useEffect(() => {
    if (result.data) {
      setNickname(result.data.nickname || "");
      setEmail(result.data.email || "");
      setAvatar(result.data.avatar);
      setUser(result.data);
    }
  }, [result.data]);
  async function save() {
    if (busy) return;
    if ((isPassword || isSetup) && (password.length < 8 || password !== confirm)) {
      setError("密码至少 8 位，且两次输入须一致");
      return;
    }
    if (isSetup && !username.trim()) {
      setError("请输入用户名");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (isPassword) {
        await api("/me/change-password", "POST", { oldPassword, newPassword: password });
        setSession(null);
        Taro.showToast({ title: "密码已修改，请重新登录", icon: "none" });
        go("auth");
      } else if (isSetup) {
        const auth = await api<Auth>("/me/setup-account", "POST", {
          username: username.trim(),
          password,
        });
        setSession(auth);
        Taro.showToast({ title: "账号设置成功", icon: "success" });
        Taro.navigateBack();
      } else {
        const user = await api<User>("/me/profile", "PATCH", {
          nickname: nickname.trim(),
          avatar,
          ...(email.trim() ? { email: email.trim() } : {}),
        });
        setUser(user);
        Taro.showToast({ title: "资料已更新", icon: "success" });
      }
      setPassword("");
      setOldPassword("");
      setConfirm("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function avatarUpload() {
    if (busy) return;
    setBusy(true);
    try {
      setAvatar(await uploadImage());
    } catch (e) {
      if (!String(e).includes("cancel")) setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <View className="brand">
        {isSetup ? "设置登录账号" : isPassword ? "修改密码" : "个人资料"}
      </View>
      <State
        error={result.error}
        loading={result.loading && !result.data}
        retry={() => result.reload(true)}
      />
      <View className="panel" onClick={(e) => e.stopPropagation()}>
        {isSetup && (
          <>
            <Text className="muted">
              设置后可在网站和 APP 登录同一个会员账号。仅可设置一次，不合并已有账号。
            </Text>
            <View className="space" />
            <Text className="label">用户名</Text>
            <Input
              className="field"
              value={username}
              maxlength={32}
              onInput={(e) => setUsername(e.detail.value)}
            />
          </>
        )}
        {isPassword && (
          <>
            <Text className="label">当前密码</Text>
            <Input
              className="field"
              password
              value={oldPassword}
              maxlength={128}
              onInput={(e) => setOldPassword(e.detail.value)}
            />
          </>
        )}
        {isPassword || isSetup ? (
          <>
            <Text className="label">新密码（至少 8 位）</Text>
            <Input
              className="field"
              password
              value={password}
              maxlength={128}
              onInput={(e) => setPassword(e.detail.value)}
            />
            <Text className="label">确认密码</Text>
            <Input
              className="field"
              password
              value={confirm}
              maxlength={128}
              onInput={(e) => setConfirm(e.detail.value)}
            />
          </>
        ) : (
          <>
            <View className="row">
              <Avatar src={avatar} name={nickname} />
              <Button
                className="button secondary small"
                disabled={busy}
                onClick={() => void avatarUpload()}
              >
                上传头像
              </Button>
            </View>
            <View className="space" />
            <Text className="label">用户名</Text>
            <View className="field">{session()?.user.username}</View>
            <Text className="label">昵称</Text>
            <Input
              className="field"
              value={nickname}
              maxlength={32}
              onInput={(e) => setNickname(e.detail.value)}
            />
            <Text className="label">邮箱</Text>
            <Input
              className="field"
              value={email}
              maxlength={255}
              onInput={(e) => setEmail(e.detail.value)}
            />
          </>
        )}
        {error && <View className="error">{error}</View>}
        <Button
          className="button"
          loading={busy}
          disabled={busy || (isSetup && !result.data?.canSetCredentials)}
          onClick={() => void save()}
        >
          {isSetup ? "确认设置" : "保存修改"}
        </Button>
        {isSetup && result.data && !result.data.canSetCredentials && (
          <Text className="muted">该账号已设置登录凭据，无需重复设置。</Text>
        )}
      </View>
    </>
  );
}
export default function Profile() {
  const mode = useRouter().params.mode || "profile";
  return (
    <Screen>
      <Private>
        <ProfileForm mode={mode} />
      </Private>
    </Screen>
  );
}
