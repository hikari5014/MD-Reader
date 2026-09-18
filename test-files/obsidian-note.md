---
type: session
title: Obsidian 語法大全
date: 2026-09-18
tags:
  - 測試
  - obsidian
status: done
done: true
count: 3
related:
  - "[[sample-zh]]"
  - "[[toc-long|長文件]]"
source: https://obsidian.md
empty:
---

# Obsidian 語法大全

相關筆記:[[sample-zh]]、[[toc-long|長文件目錄]]、[[toc-long#第 3 章 章節標題]]、[[#提示框]]、[[#^block-1]]

這段有 ==螢光筆== 和 #標籤,還有 #巢狀/標籤;緊貼標點的、#不算標籤(和 Obsidian 一樣)。但 `#程式碼裡的不算`,網址 https://example.com/#anchor 也不算。 ^block-1

這句話後面有註解%%看不到我%%結束。

%%
整段註解
也看不到
%%

## 提示框

> [!note]
> 沒寫標題的提示框,標題會是「Note」。

> [!tip] 有標題的提示框
> 內容可以有 **粗體**、[[sample-zh|連結]]、清單:
> - 第一點
> - 第二點

> [!warning]- 預設收起的提示框(點我展開)
> 藏起來的內容 MDR-FOLD-OK

> [!success]+ 預設展開、可收起
> 展開的內容

> [!question] 巢狀提示框
> 外層內容
> > [!danger] 內層
> > 內層內容

> [!faq] 別名 faq → question 的顏色

> [!quote] 引言
> 你不會提升到目標的高度,而是會跌落到系統的水準。

> 一般引用區塊不是提示框

## 嵌入

![[sample.png]]

![[sample.png|64]]

![[不存在的圖.png]]

![[sample-zh]]

## 腳註

這裡有腳註[^1],還有一個[^note]。

[^1]: 第一個腳註。
[^note]: 有名字的腳註。
