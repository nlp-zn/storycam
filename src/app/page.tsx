import {
  coreStoryboardGroups,
  expansionCards,
  workflowStages,
  storyAssets
} from "@/features/storycam/domain/shellContent";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { IdeaInputPanel } from "@/components/storycam/IdeaInputPanel";

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-5 text-stone-100 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[310px_minmax(0,1fr)_330px]">
        <IdeaInputPanel />

        <section className="rounded-lg border border-stone-700/70 bg-[#201d18]/85 p-4 shadow-2xl shadow-black/20">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-teal-200">这一段会这样拍</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-50">玻璃反光</h2>
            </div>
            <p className="rounded-md border border-teal-700/70 px-3 py-2 text-sm text-teal-100">
              核心分镜 2 / 3
            </p>
          </div>

          <div className="grid min-h-[520px] gap-3 md:grid-cols-3 md:grid-rows-3">
            {expansionCards.map((card, index) => (
              <div
                className="flex min-h-32 flex-col justify-between rounded-lg border border-stone-700 bg-stone-900/80 p-3"
                key={card}
              >
                <span className="text-xs text-stone-400">扩展卡 {index + 1}</span>
                <p className="text-lg font-medium text-stone-100">{card}</p>
                <div className="h-16 rounded-md bg-[linear-gradient(135deg,#534438,#12485a_54%,#853d3a)]" />
              </div>
            ))}

            <div className="order-first flex min-h-56 flex-col justify-between rounded-lg border border-amber-300 bg-[#2c2419] p-4 shadow-lg shadow-amber-950/40 md:order-none md:col-start-2 md:row-start-2">
              <div>
                <p className="text-xs text-amber-200">当前核心组</p>
                <h3 className="mt-2 text-xl font-semibold text-stone-50">玻璃反光</h3>
              </div>
              <div className="h-32 rounded-md bg-[linear-gradient(135deg,#3b2f28,#155e75_48%,#be4c40)]" />
              <button
                className="rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                type="button"
              >
                用这一组生成片段
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <GoogleSignInButton />

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">当前流程</h2>
            <ol className="mt-4 space-y-2">
              {workflowStages.map((stage, index) => (
                <li className="flex items-center gap-3 text-sm text-stone-300" key={stage}>
                  <span className="flex size-6 items-center justify-center rounded-full border border-stone-700 text-xs text-amber-200">
                    {index + 1}
                  </span>
                  <span>{stage}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">故事世界</h2>
            <div className="mt-4 space-y-3">
              {storyAssets.map((asset) => (
                <article className="rounded-md bg-stone-900 p-3" key={asset.label}>
                  <h3 className="text-sm font-semibold text-amber-200">{asset.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-300">{asset.text}</p>
                </article>
              ))}
            </div>
            <button
              className="mt-4 w-full rounded-md border border-teal-400 px-4 py-2 text-sm font-semibold text-teal-100 transition hover:bg-teal-950"
              type="button"
            >
              确认继续生成分镜
            </button>
          </section>

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">片段时间线</h2>
            <div className="mt-4 space-y-3">
              {coreStoryboardGroups.map((group, index) => (
                <article className="rounded-md border border-stone-700 bg-stone-900 p-3" key={group.title}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-stone-100">
                      片段 {String.fromCharCode(65 + index)}：{group.title}
                    </h3>
                    <span className="shrink-0 text-xs text-rose-200">{group.duration}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-400">{group.description}</p>
                </article>
              ))}
            </div>
            <button
              className="mt-4 w-full rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-teal-300"
              type="button"
            >
              生成最终作品
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
