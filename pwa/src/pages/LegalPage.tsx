import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export type LegalKind = 'terms' | 'privacy'

/**
 * 用户协议 / 隐私政策。
 * 不强制勾选，只提供可阅读入口；所有免责声明写在这里。
 */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const navigate = useNavigate()
  const isTerms = kind === 'terms'

  return (
    <main className="page legal-page">
      <header className="legal-header">
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="eyebrow">LEGAL</span>
          <h1>{isTerms ? '用户协议' : '隐私政策'}</h1>
        </div>
      </header>

      <p className="legal-updated">更新日期：2026-11-06</p>

      {isTerms ? (
        <>
          <section className="legal-section">
            <h2>1. 服务性质</h2>
            <p>
              淋浴 No-Ads 是一个第三方、非官方的趣智校园 PWA 客户端，不隶属于趣智校园官方，
              也不代表学校或设备运营方。本应用只调用公开可访问的趣智校园接口，不提供洗浴设备、
              热水供应、计费或支付服务。
            </p>
          </section>

          <section className="legal-section">
            <h2>2. 费用与退款</h2>
            <p>
              本应用不参与任何收费、充值、扣费、退款或金额结算。钱包余额、预扣金额、实际消费、
              账单与退款均由趣智校园平台及其运营方处理。
            </p>
            <p>
              如对金额、扣费、退款、发票或账单有争议，请直接联系趣智校园官方客服；
              本应用无法修改、冻结或退回任何资金。
            </p>
          </section>

          <section className="legal-section">
            <h2>3. 设备与服务</h2>
            <p>
              设备的在线状态、开关阀、故障处理、热水供应与现场服务均由设备运营方负责。
              如遇设备损坏、漏水、无法开关阀或服务中断，请联系趣智校园官方或现场管理人员。
            </p>
          </section>

          <section className="legal-section">
            <h2>4. 账号与凭证</h2>
            <p>
              本应用没有自建服务器。手机号、登录凭证、项目、设备、账单和偏好设置仅保存在你当前设备的本地存储中，
              不会上传到本应用的服务器。登录请求由浏览器直接发送到趣智校园 API。
            </p>
            <p>
              请妥善保管手机和浏览器数据；在公共设备上使用后，建议退出登录并清理浏览器数据。
              匿名统计不包含上述账号凭证，可在「我的」关闭。
            </p>
          </section>

          <section className="legal-section">
            <h2>5. 使用风险</h2>
            <p>
              本应用按「现状」提供，不保证接口持续可用、数据完全准确或功能不中断。
              因接口变更、网络异常、设备故障、操作失误或第三方原因造成的损失，本应用不承担责任。
              请在设备旁、确认安全的情况下使用开关阀功能，并遵守学校规章制度和法律法规。
            </p>
          </section>

          <section className="legal-section">
            <h2>6. 开源与知识产权</h2>
            <p>
              本应用使用了多个开源项目，相关版权归各自作者所有。淋浴 No-Ads 是非官方第三方工具，
              与趣智校园、学校及相关商标持有人没有隶属或授权关系。
            </p>
          </section>

          <section className="legal-section">
            <h2>7. 协议更新</h2>
            <p>
              本协议可能随功能调整而更新。继续使用即表示你已阅读更新后的内容。
              如不同意，请停止使用并清理本地数据。
            </p>
          </section>
        </>
      ) : (
        <>
          <section className="legal-section">
            <h2>1. 我们收集什么</h2>
            <p>
              本应用没有用于业务数据的自建服务器。登录、余额、设备、开关阀和账单请求由浏览器
              直接发往趣智校园 API，不经过本应用的中转服务器。
              本应用默认启用匿名使用统计（可在「我的」关闭），用于了解功能使用情况；统计不包含
              手机号、账号、密码、设备 MAC 或订单号。
            </p>
          </section>

          <section className="legal-section">
            <h2>2. 本地保存的数据</h2>
            <p>为了保持登录和使用状态，以下数据可能保存在当前设备的 localStorage / sessionStorage：</p>
            <ul>
              <li>手机号、脱敏姓名、学校/项目信息；</li>
              <li>随机生成的匿名 installId（用于统计去重）；</li>
              <li>趣智校园 loginCode、userId、accountId、projectId；</li>
              <li>最近设备、进行中订单、账单和余额快照；</li>
              <li>主题、触感、自动翻转等偏好设置；</li>
              <li>如果选择「记住密码」，仅保存密码的 MD5 后 10 位 hash，不保存明文。</li>
            </ul>
            <p>这些数据只存在你的浏览器里，不会上传到本应用自己的服务器。</p>
          </section>

          <section className="legal-section">
            <h2>3. 直接请求趣智校园 API</h2>
            <p>
              登录、余额、设备、开关阀和账单请求会直接发送到趣智校园官方 API。
              这些数据在官方平台侧的处理方式，适用趣智校园自己的隐私政策和服务条款。
              本应用无法控制官方平台的数据处理行为。
              如果你开启匿名统计，事件会发送到本应用的统计后端；统计后端只接收 installId、
              事件名、项目 id/名称、粗粒度地区、时间和时长。
            </p>
          </section>

          <section className="legal-section">
            <h2>4. 权限</h2>
            <ul>
              <li>相机：仅用于扫描设备二维码，不上传照片；</li>
              <li>方向传感器：仅用于自动翻转开关水，数据不离开设备；</li>
              <li>通知：当前未启用；</li>
              <li>匿名使用统计：仅随机 installId、事件、项目、粗粒度地区；可在「我的」关闭；</li>
              <li>不接入广告或第三方追踪 SDK。</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. 删除数据</h2>
            <p>
              退出登录会清除本地会话和记住密码数据；你也可以在「我的」关闭匿名统计，
              或在浏览器设置中清除本站数据（包括随机 installId），或卸载 PWA。
              已经发送到趣智校园官方平台的订单和账单，需要联系官方处理。
            </p>
          </section>

          <section className="legal-section">
            <h2>6. 免责声明</h2>
            <p>
              本应用是第三方非官方 PWA，仅调用开源/公开 API。金钱与收费、设备与服务均与
              本应用无关；账号密码和登录凭证不经过本应用云端，仅在本地存储。
              有金额争议、退款或设备问题，请找趣智校园官方。
            </p>
          </section>
        </>
      )}

      <div className="legal-links">
        {isTerms ? (
          <Link to="/privacy">阅读隐私政策</Link>
        ) : (
          <Link to="/terms">阅读用户协议</Link>
        )}
        <Link to="/login">返回登录</Link>
      </div>
    </main>
  )
}
