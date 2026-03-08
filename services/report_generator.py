import os
import base64
from pathlib import Path

MAX_IMAGES = 20


async def generate_report(image_paths: list[str], prompt: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return "**错误**：未设置 `ANTHROPIC_API_KEY` 环境变量，无法调用 Claude API。\n\n请在启动服务前执行：\n```\nexport ANTHROPIC_API_KEY=your_key_here\n```"

    if len(image_paths) > MAX_IMAGES:
        return f"**错误**：选中截图数量（{len(image_paths)} 张）超过上限（{MAX_IMAGES} 张）。\n\n请减少截图数量后重试。"

    try:
        import anthropic
    except ImportError:
        return "**错误**：未安装 `anthropic` 库。请运行：\n```\npip install anthropic>=0.40.0\n```"

    content = []

    for path in image_paths:
        p = Path(path)
        if not p.exists():
            continue
        suffix = p.suffix.lower()
        media_type = "image/png" if suffix == ".png" else "image/jpeg"
        with open(p, "rb") as f:
            data = base64.standard_b64encode(f.read()).decode("utf-8")
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        })

    if not content:
        return "**错误**：未找到有效的截图文件，请重新选择截图。"

    content.append({"type": "text", "text": prompt})

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": content}],
    )

    return message.content[0].text
