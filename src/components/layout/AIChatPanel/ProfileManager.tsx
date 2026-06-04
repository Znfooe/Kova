import type { AIProfile } from "./types";

interface ProfileManagerProps {
  profiles: AIProfile[];
  activeProfileId: string;
  editProfile: AIProfile | null;
  onNewProfile: () => void;
  onSelectProfile: (id: string) => void;
  onEditProfile: (profile: AIProfile | null | ((prev: AIProfile | null) => AIProfile | null)) => void;
  onSaveProfile: () => void;
  onDeleteProfile: (id: string) => void;
}

export function ProfileManager({
  profiles,
  activeProfileId,
  editProfile,
  onNewProfile,
  onSelectProfile,
  onEditProfile,
  onSaveProfile,
  onDeleteProfile,
}: ProfileManagerProps) {
  return (
    <div className="px-3 py-3">
      {/* Profile list */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] text-ink-faint">AI 配置</label>
        <button
          type="button"
          onClick={onNewProfile}
          className="text-[10px] text-accent hover:text-accent-light transition-colors"
        >+ 新建配置</button>
      </div>
      {profiles.length > 0 ? (
        <div className="space-y-1 mb-3">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${p.id === activeProfileId
                ? "bg-accent-mist/50 border border-accent/30"
                : "bg-paper-warm/40 border border-transparent hover:border-paper-deep/30"
                }`}
              onClick={() => onSelectProfile(p.id)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${p.id === activeProfileId ? "bg-accent" : "bg-ink-ghost/30"}`} />
                <span className="text-xs text-ink-soft">{p.name}</span>
                <span className="text-[10px] text-ink-ghost">({p.model})</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditProfile(editProfile?.id === p.id ? null : p); }}
                  className="w-5 h-5 flex items-center justify-center rounded text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                  title="编辑"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteProfile(p.id); }}
                  className="w-5 h-5 flex items-center justify-center rounded text-ink-ghost hover:text-danger hover:bg-danger-bg transition-colors"
                  title="删除"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-ink-ghost mb-3 py-4 text-center">暂无配置，请点击上方「新建配置」</div>
      )}

      {/* Edit form - only show when editing */}
      {editProfile && (
        <ProfileEditForm
          profile={editProfile}
          onChange={onEditProfile}
          onSave={onSaveProfile}
          onCancel={() => onEditProfile(null)}
        />
      )}
    </div>
  );
}

function ProfileEditForm({ profile, onChange, onSave, onCancel }: {
  profile: AIProfile;
  onChange: (profile: AIProfile | null | ((prev: AIProfile | null) => AIProfile | null)) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-paper-deep/25 pt-3">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] text-ink-soft font-medium">
          {profile.id ? "编辑配置" : "新建配置"}
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-ink-ghost hover:text-ink-soft transition-colors"
        >取消</button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-ink-faint block mb-0.5">配置名称</label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => onChange((p) => p ? { ...p, name: e.target.value } : p)}
            placeholder="我的 AI"
            className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
          />
        </div>
        <div>
          <label className="text-[10px] text-ink-faint block mb-0.5">API 地址</label>
          <input
            type="text"
            value={profile.base_url}
            onChange={(e) => onChange((p) => p ? { ...p, base_url: e.target.value } : p)}
            placeholder="https://api.openai.com/v1"
            className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-ink-faint block mb-0.5">API Key</label>
            <input
              type="password"
              value={profile.api_key}
              onChange={(e) => onChange((p) => p ? { ...p, api_key: e.target.value } : p)}
              placeholder="sk-..."
              className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
            />
          </div>
          <div>
            <label className="text-[10px] text-ink-faint block mb-0.5">模型</label>
            <input
              type="text"
              value={profile.model}
              onChange={(e) => onChange((p) => p ? { ...p, model: e.target.value } : p)}
              placeholder="gpt-4o"
              className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
            />
          </div>
        </div>
      </div>
      <div className="mt-2">
        <label className="text-[10px] text-ink-faint block mb-0.5">系统提示词（可选）</label>
        <textarea
          value={profile.system_prompt}
          onChange={(e) => onChange((p) => p ? { ...p, system_prompt: e.target.value } : p)}
          placeholder="定义 AI 的角色和风格，例如：你是一个温柔的助手，喜欢用可爱的语气回答"
          rows={3}
          className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40 resize-none"
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-ink-faint block mb-0.5">上下文消息数</label>
          <input
            type="number"
            value={profile.max_context_messages}
            onChange={(e) => onChange((p) => p ? { ...p, max_context_messages: Number(e.target.value) } : p)}
            onFocus={(e) => e.target.select()}
            placeholder="20"
            min={0}
            className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
          />
          <span className="text-[9px] text-ink-ghost mt-0.5 block">0 表示不限制</span>
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="enable-summary"
            checked={profile.enable_summary}
            onChange={(e) => onChange((p) => p ? { ...p, enable_summary: e.target.checked } : p)}
            className="w-3.5 h-3.5 accent-accent"
          />
          <label htmlFor="enable-summary" className="text-[10px] text-ink-faint">摘要记忆</label>
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="enable-thinking"
            checked={profile.enable_thinking}
            onChange={(e) => onChange((p) => p ? { ...p, enable_thinking: e.target.checked } : p)}
            className="w-3.5 h-3.5 accent-accent"
          />
          <label htmlFor="enable-thinking" className="text-[10px] text-ink-faint">深度思考</label>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-ink-faint block mb-0.5">温度 (temperature)</label>
          <input
            type="number"
            value={profile.temperature}
            onChange={(e) => onChange((p) => p ? { ...p, temperature: Number(e.target.value) } : p)}
            onFocus={(e) => e.target.select()}
            placeholder="1.0"
            min={0}
            max={2}
            step={0.1}
            className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
          />
          <span className="text-[9px] text-ink-ghost mt-0.5 block">0-2，越高越有创造性</span>
        </div>
        <div>
          <label className="text-[10px] text-ink-faint block mb-0.5">最大 tokens</label>
          <input
            type="number"
            value={profile.max_tokens}
            onChange={(e) => onChange((p) => p ? { ...p, max_tokens: Number(e.target.value) } : p)}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            min={0}
            className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
          />
          <span className="text-[9px] text-ink-ghost mt-0.5 block">0 表示不限制</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1 text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity"
        >保存</button>
      </div>
    </div>
  );
}
