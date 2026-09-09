# 中国象棋视觉素材

风格：新中式水墨、宣纸肌理、浅木棋子、朱红与墨色。

生成方式：Codex 内置 image_gen。仓库包含接入网页的压缩素材；原始 PNG、JPG 和生成概念图保留在本地，不随仓库上传。

| 文件 | 用途 |
| --- | --- |
| hero.webp | 大厅主视觉，左侧留白用于标题与按钮 |
| board.webp | 对局使用的原木棋盘背景 |
| landscape.webp | 山水背景，中上部留白用于内容 |
| pieces/*.webp | 红黑各七类透明棋子 |

大厅与山水图中的棋子是装饰；实际对局使用独立棋盘背景和可交互棋子图。棋位与走法由规则引擎决定，不依赖插画内容。

## 生成提示词

### hero

```text
Create one polished standalone image asset for a new Chinese xiangqi browser game. Art direction: contemporary Chinese literati aesthetic, tactile xuan rice paper, pale natural maple, charcoal ink, restrained cinnabar red and very faint celadon washes. Elegant and inviting, recognizably Chinese, not royal luxury, not fantasy combat. Fine brushwork and subtle paper fibers, clean shapes and generous negative space. No English, no website mockup, no buttons, no branding, no watermarks, no decorative labels. Xiangqi pieces are thick round flat wooden discs bearing a single Chinese character, never upright Western chess figurines, never Go stones.
Use case: stylized-concept. Asset type: landscape website lobby hero, 3:2 aspect ratio, ideally 1536x1024. An exquisite editorial still life merging soft realistic wooden pieces with a hand-painted ink wash landscape. A cropped portion of a light wooden xiangqi board sits in the lower right, only a few straight intersection lines visible, no full game diagram. Three large beautiful round xiangqi discs in the right half, two face up with exact deeply engraved Chinese characters '帥' in cinnabar red and '將' in charcoal black, third disc on its side showing wood grain. Accurate readable traditional Chinese characters. A single soft ink mountain ridge and pale mist connect the objects to the paper ground. Approximately the left 50 percent is clean light rice-paper negative space for future HTML text. No additional text. Soft morning light, no harsh cast shadows, museum-quality Chinese stationery campaign composition, off-center framing. The main pieces are fully visible with margin.
```

### pieces

```text
Create one polished standalone image asset for a new Chinese xiangqi browser game. Art direction: contemporary Chinese literati aesthetic, tactile xuan rice paper, pale natural maple, charcoal ink, restrained cinnabar red and very faint celadon washes. Elegant and inviting, recognizably Chinese, not royal luxury, not fantasy combat. Fine brushwork and subtle paper fibers, clean shapes and generous negative space. No English, no website mockup, no buttons, no branding, no watermarks, no decorative labels. Xiangqi pieces are thick round flat wooden discs bearing a single Chinese character, never upright Western chess figurines, never Go stones.
Use case: product-mockup. Asset type: square editorial illustration / game entry cover, ideally 1536x1536. Close-up of exactly two exquisitely crafted traditional Chinese xiangqi wooden discs on a pale rice-paper ground. One foreground pale maple disc with a deeply engraved red Chinese character '帥', one slightly behind and offset with a deeply engraved charcoal Chinese character '將'. Characters upright facing camera and clearly correct, each within a thin carved concentric ring. The discs lie at a shallow angle so their circular faces and gentle wooden bevel thickness are visible. Two separate objects, not joined, not intersecting. Faint fine ink brush sweep behind them, a tiny celadon haze, all confined to central lower area; ample clean margin on all four sides. Soft natural light and restrained contact shadows. Tactile handcrafted grain, sophisticated Chinese still-life illustration with highly resolved product detail. No extra objects, no extra lettering, no chessboard.
```

### background

```text
Create one polished standalone image asset for a new Chinese xiangqi browser game. Art direction: contemporary Chinese literati aesthetic, tactile xuan rice paper, pale natural maple, charcoal ink, restrained cinnabar red and very faint celadon washes. Elegant and inviting, recognizably Chinese, not royal luxury, not fantasy combat. Fine brushwork and subtle paper fibers, clean shapes and generous negative space. No English, no website mockup, no buttons, no branding, no watermarks, no decorative labels. Xiangqi pieces are thick round flat wooden discs bearing a single Chinese character, never upright Western chess figurines, never Go stones.
Use case: illustration-story. Asset type: wide webpage atmosphere background, 3:2 landscape, ideally 1536x1024. A quiet Chinese shanshui landscape evoking the Chu-Han river of xiangqi, painted as a restrained contemporary ink-and-wash scroll. Pale distant layered mountains at the extreme right and along the very low horizon, a broad river dissolving into blank paper, a few fine reed or bamboo brushstrokes at the lower left edge. A miniature grouping of two round wooden xiangqi pieces, one with red '帥' and one with dark '將', in the extreme lower right foreground to tie the landscape to the game, small and unobtrusive. Center and upper two thirds should be almost entirely clean off-white xuan-paper space with very subtle fibers, suitable behind a real interactive game board. Low contrast, airy, elegant, restrained celadon ink diluted with water. Flat continuous background, no frame, no fold, no scroll rods. No writing other than the two tiny piece characters; no map, no UI, no full board.
```
