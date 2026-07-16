// app/routes/index.tsx
// Combined: route config + component + server function (single-file reference version)

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { useState, useTransition } from 'react'
import { z } from 'zod'

// ---------- Types ----------
type Style = 'cinematic_dark' | 'y2k_retro' | 'cyberpunk' | 'anime'

interface ClipResult {
    index: number
    status: 'pending' | 'done' | 'error'
    videoUrl?: string
}

const STYLES: { value: Style; label: string }[] = [
    { value: 'cinematic_dark', label: 'Cinematic Dark' },
    { value: 'y2k_retro', label: 'Y2K Retro' },
    { value: 'cyberpunk', label: 'Cyberpunk' },
    { value: 'anime', label: 'Anime' },
]

const STYLE_MODIFIERS: Record<Style, string> = {
    cinematic_dark: 'moody chiaroscuro lighting, desaturated palette, anamorphic lens flare, film grain',
    y2k_retro: 'early-2000s digital camera look, chrome gradients, sun-bleached highlights, low-fi grain',
    cyberpunk: 'neon-drenched night city, magenta and cyan rim light, rain-slicked reflections, holographic glow',
    anime: 'cel-shaded, bold linework, dramatic motion blur, saturated color palette',
}

// ---------- Server function ----------
const ForgeInput = z.object({
    topic: z.string().min(1).max(200),
    style: z.enum(['cinematic_dark', 'y2k_retro', 'cyberpunk', 'anime']),
})

async function callHiggsfield(tool: 'generate_image' | 'generate_video', payload: unknown) {
    const res = await fetch(`${process.env.HIGGSFIELD_API_BASE}/${tool}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
        },
        body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`${tool} failed: ${res.status}`)
    return res.json() as Promise<{ job_id: string; result_url: string }>
}

async function forgeOneClip(topic: string, styleModifier: string, sceneIndex: number): Promise<string> {
    const scenePrompt = `${topic}, scene ${sceneIndex + 1} of 3, ${styleModifier}, 5 second cinematic shot`

    const imageJob = await callHiggsfield('generate_image', {
        model: 'nano_banana_2',
        prompt: scenePrompt,
        params: { aspect_ratio: '9:16' },
    })

    const videoJob = await callHiggsfield('generate_video', {
        model: 'seedance_2_0',
        prompt: scenePrompt,
        params: {
            duration: 5,
            aspect_ratio: '9:16',
            medias: [{ role: 'start_image', value: imageJob.job_id }],
        },
    })

    return videoJob.result_url
}

const forgeVideoAction = createServerFn({ method: 'POST' })
    .validator(ForgeInput)
    .handler(async ({ data }) => {
        const { topic, style } = data
        const modifier = STYLE_MODIFIERS[style]

        const results = await Promise.allSettled(
            Array.from({ length: 3 }, (_, i) => forgeOneClip(topic, modifier, i))
        )

        return {
            clips: results.map((r, index) =>
                r.status === 'fulfilled'
                    ? { index, status: 'done' as const, videoUrl: r.value }
                    : { index, status: 'error' as const }
            ),
        }
    })

// ---------- Component ----------
function HomePage() {
    const [topic, setTopic] = useState('')
    const [style, setStyle] = useState<Style>('cinematic_dark')
    const [clips, setClips] = useState<ClipResult[]>([])
    const [isPending, startTransition] = useTransition()

    function handleForge() {
        if (!topic.trim()) return
        setClips([0, 1, 2].map((i) => ({ index: i, status: 'pending' })))

        startTransition(async () => {
            const result = await forgeVideoAction({ data: { topic, style } })
            setClips(result.clips)
        })
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col lg:flex-row gap-8 p-8">
            <div className="w-full lg:w-[380px] shrink-0 space-y-6">
                <h1 className="text-2xl font-semibold tracking-tight">Virelume Forge</h1>

                <div className="space-y-2">
                    <label className="text-sm text-neutral-400">Video Topic</label>
                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Mind-bending Space Facts"
                        rows={2}
                        className="w-full rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm text-neutral-400">Visual Style</label>
                    <select
                        value={style}
                        onChange={(e) => setStyle(e.target.value as Style)}
                        className="w-full rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                        {STYLES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleForge}
                    disabled={isPending || !topic.trim()}
                    className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-neutral-800
                     disabled:text-neutral-500 transition-colors py-3 text-sm font-medium"
                >
                    {isPending ? 'Forging…' : 'Forge Video'}
                </button>
            </div>

            <div className="flex-1">
                {clips.length === 0 ? (
                    <div className="h-full min-h-[400px] flex items-center justify-center rounded-2xl
                           border border-dashed border-neutral-800 text-neutral-600 text-sm">
                        Your first forge appears here
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {clips.map((clip) => (
                            <div key={clip.index} className="rounded-2xl bg-neutral-900 border border-neutral-800
                                                 overflow-hidden aspect-[9/16]">
                                {clip.status === 'pending' && <div className="w-full h-full animate-pulse bg-neutral-800" />}
                                {clip.status === 'done' && clip.videoUrl && (
                                    <video src={clip.videoUrl} autoPlay muted loop playsInline
                                        className="w-full h-full object-cover" />
                                )}
                                {clip.status === 'error' && (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-red-400">
                                        Clip failed
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ---------- Route ----------
export const Route = createFileRoute('/')({
    component: HomePage,
    head: () => ({
        meta: [
            { title: 'Virelume Forge — 1-Click Faceless Video Agent' },
            { name: 'description', content: 'Turn any topic into 3 cinematic faceless video clips.' },
        ],
    }),
})