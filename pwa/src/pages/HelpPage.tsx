import {
  Camera,
  CheckCircle2,
  Droplets,
  Hand,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useState } from 'react'
import { AutoTutorial } from '../components/AutoTutorial'
import { PageHeader } from '../components/PageHeader'

export function HelpPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false)

  return (
    <main className="page help-page">
      <PageHeader title="使用帮助" subtitle="自动控水 · 开关水 · 权限" back />

      <section className="help-hero">
        <span className="help-hero__icon">
          <Droplets size={27} />
        </span>
        <div>
          <h2>翻转手机，水阀随开随关</h2>
          <p>自动模式用手机姿态控制水阀：扣下暂停，翻回继续，竖直 3 秒结束。</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setTutorialOpen(true)}>
          <PlayCircle size={17} /> 播放动画教程
        </button>
      </section>

      <section className="help-section">
        <div className="help-section__title">
          <span><Droplets size={18} /></span>
          <h2>怎么开水</h2>
        </div>
        <ol className="help-steps">
          <li>
            <b>1</b>
            <span>在首页点「扫码用水」，或点底部「扫码」。</span>
          </li>
          <li>
            <b>2</b>
            <span>把摄像头对准水表上的二维码，识别后确认设备。</span>
          </li>
          <li>
            <b>3</b>
            <span>想自动控制，就打开「自动翻转」。第一次会请求方向传感器权限。</span>
          </li>
          <li>
            <b>4</b>
            <span>点「开始用水」，水阀打开，开始计时。</span>
          </li>
        </ol>
      </section>

      <section className="help-section">
        <div className="help-section__title">
          <span><RotateCcw size={18} /></span>
          <h2>怎么关水 / 暂停</h2>
        </div>
        <div className="help-cards">
          <div className="help-card">
            <CheckCircle2 size={18} />
            <div>
              <strong>轻触按钮</strong>
              <p>点「结束用水」立即结束。手动模式最直接。</p>
            </div>
          </div>
          <div className="help-card">
            <Hand size={18} />
            <div>
              <strong>长按空白处 5 秒</strong>
              <p>在洗澡页空白处按住约 5 秒也会结束，松手即取消。两种模式都可以用。</p>
            </div>
          </div>
          <div className="help-card help-card--accent">
            <Smartphone size={18} />
            <div>
              <strong>自动模式</strong>
              <p>屏幕朝下扣在桌上暂停；屏幕朝上平放继续；竖直拿起约 3 秒结束。</p>
              <p>最终结束仍然可以点按钮或长按，不会只依赖姿态。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="help-section">
        <div className="help-section__title">
          <span><ShieldCheck size={18} /></span>
          <h2>权限</h2>
        </div>
        <ul className="help-list">
          <li>
            <Camera size={17} />
            <span><strong>摄像头</strong>：只在扫码时请求，用于识别水表二维码，不上传画面。</span>
          </li>
          <li>
            <Smartphone size={17} />
            <span><strong>方向传感器</strong>：自动模式需要。iOS 会弹系统授权；拒绝后仍可手动开关水。</span>
          </li>
          <li>
            <ShieldCheck size={17} />
            <span><strong>屏幕常亮</strong>：洗澡时会申请，避免息屏退出自动模式。浏览器不支持或申请失败时，会提示你手动延长息屏时间。</span>
          </li>
        </ul>
      </section>

      <section className="help-section">
        <div className="help-section__title">
          <span><ShieldCheck size={18} /></span>
          <h2>注意事项</h2>
        </div>
        <ul className="help-list help-list--warn">
          <li><strong>息屏会退出自动模式。</strong>自动模式需要保持亮屏；洗澡期间应用会尽量阻止息屏。</li>
          <li>首次开启自动模式有 15 秒防误触保护，期间拿起手机不会结束用水。</li>
          <li>浴室水汽和溅水可能损坏手机，建议使用支持生活防水的手机，并放在远离水流的位置。</li>
          <li>自动模式只负责暂停/继续/结束；设备故障、扣费异常请联系趣智校园官方。</li>
        </ul>
      </section>

      <AutoTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </main>
  )
}
