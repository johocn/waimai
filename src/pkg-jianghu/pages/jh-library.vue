<template>
    <view class="dd">
        <view class="topbar">
            <view class="tb-l">
                <text class="title">学校图书馆 · 密页传递</text>
                <text class="sub">水墨江湖 · 2D 横版 · 闭馆后的秘密流转（书架·背景画·阅览桌·故事角）</text>
            </view>
            <view class="seal">江湖</view>
        </view>

        <!-- 张力模型：暴露度 + 可取时间窗（P1） -->
        <view class="tension">
            <view class="ten-row">
                <text class="ten-l">暴露度</text>
                <view class="ten-bar">
                    <view class="ten-fill" :style="{ width: exposure + '%', background: exposure > 70 ? 'linear-gradient(90deg,#C8A24A,#FF4D4F)' : 'linear-gradient(90deg,#1F6F5C,#C8A24A)' }"></view>
                </view>
                <text class="ten-v">{{ exposure }}% · {{ exposureLevel }}</text>
            </view>
            <view class="ten-row">
                <text class="ten-l">可取窗</text>
                <text class="ten-win" :class="{ warn: phase === 'PICKABLE' }">{{ windowText }}</text>
            </view>
            <view class="ten-row">
                <text class="ten-l">巡逻</text>
                <text class="ten-win" :class="{ warn: patrolRiskPct >= 50 }">{{ patrolStateText }} · 发现风险 {{ patrolRiskPct }}% · 难度 ×{{ difficulty.toFixed(2) }}</text>
            </view>
            <view class="ten-row" v-if="anomalyHint">
                <text class="ten-l">异常</text>
                <text class="ten-win warn">{{ anomalyHint }}</text>
            </view>
        </view>

        <!-- 警觉条（本轮增强：把抽象巡逻风险变成可见可应对的视线风险） -->
        <view class="alert-row" v-if="alertVal > 0.02 || inSight">
            <view class="alert-ic" :class="{ on: inSight }">👁</view>
            <view class="alert-bar">
                <view class="alert-fill" :class="{ hot: alertVal > 0.6, mid: alertVal > 0.3 && alertVal <= 0.6 }" :style="{ width: Math.round(alertVal * 100) + '%' }"></view>
            </view>
            <text class="alert-tx" :class="{ warn: alertVal > 0.6 }">{{ alertVal > 0.6 ? '被盯上了！快收手' : alertVal > 0.3 ? '有视线扫过' : '安全' }}</text>
        </view>

        <!-- 本轮增强：环境 / 策略控制条 -->
        <view class="scene-ctrls">
            <view class="scb" :class="{ on: lampOn }" @tap="toggleLamp">{{ lampOn ? '台灯·昼' : '台灯·夜' }}</view>
            <view class="scb" :class="{ on: uvOn, locked: !uvUnlocked, shake: uvShake }" @tap="toggleUV">{{ uvUnlocked ? '紫外显影' : '🔒紫外显影' }}</view>
            <view class="uv-bubble" v-if="uvBubble">{{ uvBubble }}</view>
            <view class="scb" :class="{ on: distractSec > 0 }" @tap="doDistract">{{ distractSec > 0 ? '引开中 ' + distractSec + 's' : '引开馆员' }}</view>
            <view class="scb" @tap="showScore">通关评分</view>
            <view class="scb" :class="{ on: clueOpen }" @tap="clueOpen = !clueOpen">线索链</view>
        </view>

        <!-- 线索依赖图：解谜/道具相互解锁进度 -->
        <view class="clue-chain" v-if="clueOpen">
            <view class="cc-title">线索链 · 相互解锁</view>
            <view class="cc-row" v-for="c in clueChain" :key="c.id" :class="{ got: c.unlocked, just: justUnlocked[c.id] }">
                <text class="cc-ic">{{ c.unlocked ? '✓' : '🔒' }}</text>
                <view class="cc-body">
                    <text class="cc-label">{{ c.label }}</text>
                    <text class="cc-hint" v-if="!c.unlocked">{{ c.hint }}</text>
                    <text class="cc-hint got" v-else>已解锁</text>
                </view>
            </view>
        </view>

        <view class="scene-wrap" :class="{ shake: shakeStage }">
            <div ref="gameContainer" class="stage"></div>
            <view class="spotted-flash" v-if="spottedFlash"></view>
            <view class="scene-bar">
                <view class="sb-btn" @tap="callScene('zoomBy', 1.2)">放大 ＋</view>
                <view class="sb-btn" @tap="callScene('zoomBy', 0.83)">缩小 －</view>
                <view class="sb-btn" @tap="callScene('resetCamera')">复位视野</view>
            </view>
        </view>

        <!-- 工具盘（「手」默认常驻：直接拿起任何可互动物件） -->
        <view class="tools">
            <view class="tool" :class="{ on: tool === 'hand', off: !toolEnabled.hand }" @tap="setTool('hand')">
                <text class="t-ic">✋</text><text class="t-tx">手·拿起</text>
            </view>
            <view class="tool" :class="{ on: tool === 'hide', off: !toolEnabled.hide }" @tap="setTool('hide')">
                <text class="t-ic">✉️</text><text class="t-tx">藏·投</text>
            </view>
            <view class="tool" :class="{ on: tool === 'mark', off: !toolEnabled.mark }" @tap="setTool('mark')">
                <text class="t-ic">🔖</text><text class="t-tx">签·标</text>
            </view>
            <view class="tool" :class="{ on: tool === 'use', off: !toolEnabled.use }" @tap="setTool('use')">
                <text class="t-ic">🧰</text><text class="t-tx">物·用</text>
            </view>
            <view class="tool" :class="{ on: tool === 'pick', off: !toolEnabled.pick }" @tap="setTool('pick')">
                <text class="t-ic">📮</text><text class="t-tx">取·收</text>
            </view>
            <view class="tool" :class="{ on: tool === 'person', off: !toolEnabled.person }" @tap="setTool('person')">
                <text class="t-ic">🚶</text><text class="t-tx">人·走</text>
            </view>
        </view>
        <view class="tool-hint">{{ toolHint }}</view>

        <!-- 桌子动作条：短按大阅览桌弹出（翻面后桌底可粘附暗物） -->
        <view class="table-act" v-if="tableAct.open">
            <text class="ta-t">大阅览桌 · {{ tableAct.flipped ? '已翻面（桌底可粘物）' : '正常' }}</text>
            <text class="ta-d" v-if="tableAct.top.length">桌面上有 {{ tableAct.top.length }} 件东西，需先拿走才能翻面</text>
            <text class="ta-d" v-else-if="!tableAct.flipped">桌底是盲区：翻过来就能把信函粘在桌底</text>
            <text class="ta-d" v-else>桌底已粘 {{ tableAct.under.length }} 件；翻回去可消除这份显眼异常</text>
            <view class="ta-btns">
                <button class="btn sm primary" :disabled="tableAct.busy" @tap="doFlipTable">{{ tableAct.flipped ? '翻回正面' : '翻面' }}</button>
                <button class="btn sm ghost" v-if="tableAct.flipped && tableAct.under.length" @tap="doTakeFromUnder">从桌底取回</button>
                <button class="btn sm ghost" @tap="tableAct.open = false">关闭</button>
            </view>
        </view>

        <!-- 生效中的道具效果（可见反馈，证明道具已触发） -->
        <view class="fx" v-if="activeEffects.length">
            <view v-for="e in activeEffects" :key="e.k" class="fx-item">
                <text>{{ e.t }}</text>
            </view>
        </view>

        <!-- 新手引导（可关闭） -->
        <view v-if="showOnboard" class="onboard">
            <text class="ob-t">四步上手：①「藏·投」点画面选区域与手法投放 → ②「签·标」留便签指路 → ③到可取窗用「取·收」走到暗点点开信函、查线索拼暗号报号 → ④证据越少巡逻越慢；善后清理痕迹，否则下一局更难。随手试试：按住书本可拿起、短按书本可翻开（页间能藏东西），短按阅览桌可翻面（桌底能粘信函）——但翻开的书和翻过去的桌都会抬高暴露度。</text>
            <text class="ob-x" @tap="showOnboard = false">知道了 ✕</text>
        </view>

        <!-- 操作面板：藏 / 传 / 道具 / 技能（藏匿·传递·道具三维度 + 技能系统） -->
        <view class="ops">
            <view class="ops-head" @tap="opOpen = !opOpen">
                <text class="ops-t">密信操作手册</text>
                <text class="ops-arr">{{ opOpen ? '收起 ▲' : '展开 ▼' }}</text>
            </view>
            <view v-if="opOpen" class="ops-body">
                <view class="ops-tabs">
                    <view class="ops-tab" :class="{ on: opTab === '藏' }" @tap="opTab = '藏'">藏</view>
                    <view class="ops-tab" :class="{ on: opTab === '传' }" @tap="opTab = '传'">传</view>
                    <view class="ops-tab" :class="{ on: opTab === '道具' }" @tap="opTab = '道具'">道具</view>
                    <view class="ops-tab" :class="{ on: opTab === '技能' }" @tap="opTab = '技能'">技能</view>
                </view>
                <view class="ops-list">
                    <view
                        v-for="it in opItems"
                        :key="it.k"
                        class="ops-card"
                        :style="isOpSelected(it) ? { borderColor: '#C8A24A', background: 'rgba(200,162,74,.14)' } : null"
                        @tap="onOpCardTap(it)"
                    >
                        <view class="ops-card-t">{{ it.t }}<text v-if="isOpSelected(it)" class="ops-sel">·已选用</text></view>
                        <view v-if="it.d" class="ops-card-d">{{ it.d }}</view>
                        <view v-if="it.tag" class="ops-tag">{{ it.tag }}</view>
                    </view>
                </view>

                <!-- 自定义技能 UGC 审核闭环（高级客户自定义技能 + 人工审核） -->
                <view v-if="opTab === '技能'" class="ugc">
                    <text class="ugc-t">自定义技能 · 提交后进入人工审核（pending → approved / rejected）</text>
                    <view class="ugc-form">
                        <view class="ugc-cats">
                            <view v-for="c in SKILL_CATEGORIES" :key="c.id" class="ugc-cat" :class="{ on: ugc.cat === c.id }" @tap="ugc.cat = c.id">{{ c.name }}</view>
                        </view>
                        <input class="inp" v-model="ugc.name" placeholder="技能名（如：窗台借光传信）" />
                        <textarea class="area" v-model="ugc.desc" placeholder="说明位置 / 触发 / 如何不露痕迹" />
                        <button class="btn primary sm" @tap="submitUgc">提交审核</button>
                    </view>
                    <view class="ugc-list">
                        <view v-for="s in mySkills" :key="s.id" class="ugc-item">
                            <view class="ugc-item-t">
                                {{ s.name }}
                                <text class="ugc-badge" :class="s.status">{{ { pending: '审核中', approved: '已入库', rejected: '已驳回' }[s.status] }}</text>
                            </view>
                            <text class="ugc-item-d">{{ s.desc }}</text>
                            <view class="ugc-item-btns" v-if="s.status === 'pending'">
                                <text class="ubtn wait">审核中 · 由运营后台处理</text>
                            </view>
                            <view class="ugc-item-btns" v-else>
                                <text class="ubtn" @tap="useSkill(s.id)">{{ s.status === 'approved' ? '演练(生效)' : '演练(失败+反噬)' }}</text>
                            </view>
                        </view>
                        <text v-if="!mySkills.length" class="ugc-none">还没有提交过自定义技能；approved 后将出现在「藏/传」选择器。</text>
                    </view>
                </view>
            </view>
        </view>

        <!-- 背包 -->
        <view class="bag">
            <view class="bag-btn" @tap="bagOpen = !bagOpen">🎒 背包</view>
            <view class="bag-panel" v-if="bagOpen">
                <view class="bag-item" @tap="callScene('revealPainting')">🖼️ 取下/挂上背景画（演示藏点）</view>
                <view class="bag-item" @tap="callScene('tearBook')">📖 撕下书页（可修复演示）</view>
                <view class="bag-item" @tap="callScene('sealShelf')">🔒 封闭架位（不可修复演示）</view>
                <view class="bag-item" @tap="useProp('distraction')">🎇 抛出干扰物（引开巡逻 {{ DISTRACT_MS / 1000 }}s）</view>
                <view class="bag-item" @tap="storyOpen = true">🎭 人物故事会（说书人发道具）</view>
                <text class="bag-h">持有道具（{{ ownedProps.length }}）· 点「使用」即时生效</text>
                <view class="bag-props">
                    <view v-for="pr in ownedProps" :key="pr.id" class="bag-prop">
                        <view class="bp-row">
                            <text class="bp-t">{{ pr.name }}</text>
                            <text class="bp-use" @tap.stop="useProp(pr.id)">{{ propActionText(pr.id) }}</text>
                        </view>
                        <text class="bp-d">{{ pr.effect }}</text>
                    </view>
                </view>
                <text v-if="!ownedProps.length" class="bag-n">尚未持有道具，去「人物故事会」找说书人领取。</text>
                <text class="bag-h">未持有（{{ missingProps.length }}）· 需机缘解锁</text>
                <view class="bag-props">
                    <view v-for="pr in missingProps" :key="pr.id" class="bag-prop off">
                        <view class="bp-row">
                            <text class="bp-t">{{ pr.name }}</text>
                            <text class="bp-use off" @tap.stop="storyOpen = true">去故事会</text>
                        </view>
                        <text class="bp-d">{{ pr.effect }}</text>
                    </view>
                </view>
            </view>
        </view>

        <!-- 场景对象演示（实例化 + 可修复/不可修复教学道具） -->
        <view class="demo">
            <text class="demo-t">场景对象演示</text>
            <view class="demo-btns">
                <view class="dbtn" @tap="callScene('revealPainting')">取/挂背景画</view>
                <view class="dbtn" @tap="callScene('tearBook')">撕书页</view>
                <view class="dbtn" @tap="callScene('sealShelf')">封架位</view>
                <view class="dbtn warn" @tap="callScene('patrolSeize')">模拟高暴露截获</view>
                <view class="dbtn" @tap="callScene('resetCamera')">复位视野</view>
                <view class="dbtn ghost" @tap="callScene('resetScene')">重置场景</view>
            </view>
            <text class="demo-n">撕下的书页 15 秒后自动复原（可修复）；封闭架位不可自动修复，只能手动重开。</text>
        </view>

        <view class="ribbon">
            <text class="r-l">当前身份：{{ roleText }}</text>
            <text class="r-mid">分歧线索 · 本局可见藏点 {{ myStashes.length }} 处</text>
            <text class="r-r" v-if="p">江湖声望 {{ p.rep }}</text>
        </view>

        <!-- IDLE -->
        <view class="panel" v-if="phase === 'IDLE'">
            <text class="p-t">空信箱。选「藏信」工具点场景里的书架/背景画/阅览桌/管理台，即在该区域投放；也可点下方按钮默认投到书架区。先在「人物故事会」取得道具，能藏得更深。两人全程不必同时在线。</text>
            <button class="btn primary" @tap="openForm()">填写情报并投放（书架区）</button>
            <text class="hint">提示：也可直接拿「藏信」工具点击画面里的区域。</text>
        </view>

        <!-- PLACED -->
        <view class="panel" v-else-if="phase === 'PLACED'">
            <view class="info">
                <text class="info-t">情报已入暗点 · 你已离场（明文不可回看）</text>
                <text class="info-r">藏处：{{ zoneLabel(drop?.zone) }}<text v-if="drop?.gx != null"> · 格 ({{ drop.gx }},{{ drop.gy }})</text></text>
                <text class="info-r">主题：{{ topicHint }}</text>
                <text class="info-r" v-if="drop?.methodId">藏匿手法：{{ methodName(drop.methodId) }}</text>
                <text class="info-r" v-if="drop?.channelId">传递通道：{{ channelName(drop.channelId) }}</text>
                <text class="info-r">标记：{{ drop?.markerText }}（按便签定位藏点）</text>
                <text class="info-r">距可取窗口还有 {{ toPick }}</text>
            </view>
            <button class="btn" @tap="ff(3)">快进到可取窗口（演示）</button>
            <button class="btn ghost" @tap="doReset">重置暗点</button>
        </view>

        <!-- PICKABLE -->
        <view class="panel" v-else-if="phase === 'PICKABLE'">
            <view class="info">
                <text class="info-t">可取窗口已开启 · 上线「云中君」可来取件</text>
                <text class="info-r">标记：{{ drop?.markerText }}（按便签定位藏点）</text>
                <text class="info-r">窗口剩余 {{ winLeft }}</text>
                <text class="info-r" v-if="hasProp(world, 'pocket-watch')">怀表·巡逻警觉 {{ patrolAlertPct }}%（越高越快被盯上）</text>
                <text class="info-r">信函：{{ letterOpened ? '已点开 · 限时 ' + pickCostLeft + 's 内报号' : '未点开（用「取·收」工具走到暗点附近点开）' }}</text>
            </view>

            <view class="code-box">
                <text class="c-t">接头暗号（上线须报对暗号才可开信）</text>
                <text class="c-hint">线索：{{ codeHintText }}</text>
                <text v-if="hasProp(world, 'decode-glass') || hasProp(world, 'developer')" class="c-hidden">隐写线索（解码镜/显影剂）：背景画夹层题诗「{{ PAINTING_POEM }}」</text>
                <text v-if="revealedCodeText" class="c-reveal">显影结果：接头暗号「{{ revealedCodeText }}」</text>
                <text class="c-tries" v-if="codeTriesText">{{ codeTriesText }}</text>
                <view class="marks">
                    <view v-for="c in codeList" :key="c.k" class="mark" :class="{ on: pickCode === c.k, cand: isCandidate(c.k) }" @tap="pickCode = c.k">
                        <text>{{ c.t }}</text>
                    </view>
                </view>
            </view>

            <button class="btn primary" :disabled="acting" @tap="doPickup">以「上线」身份按暗号取件</button>
            <button class="btn ghost" @tap="ff(31)">模拟超时（演示巡查截获）</button>

            <!-- 识别系统：线索碎片 → 拼合候选暗号 -->
            <view class="clue">
                <text class="c-t">识别 · 线索拼合</text>
                <text class="c-hint">{{ clueGuide }}</text>
                <view class="clue-btns">
                    <view class="cbtn" v-for="s in CLUE_SOURCES" :key="s.id" @tap="collectClue(s.id)">{{ s.name }}</view>
                </view>
                <view class="clue-list" v-if="clueItems.length">
                    <view v-for="c in clueItems" :key="c.source" class="clue-item">
                        <text class="ci-s">{{ c.name }}</text>
                        <text class="ci-t">{{ c.text }}</text>
                        <text class="ci-w">{{ c.where }}</text>
                    </view>
                </view>
                <text v-else class="c-hint">尚未取得线索：点上方按钮查书架 / 背景画 / 借阅卡。</text>
                <text class="c-tries" v-if="candidateCount">{{ candidateCount }} 个暗号可拼合（金色标记）</text>
            </view>
        </view>

        <!-- PICKED -->
        <view class="panel" v-else-if="phase === 'PICKED'">
            <view class="info">
                <text class="info-t">情报已被取走 · 取件人 {{ drop?.pickedBy }}</text>
                <text class="info-r">取件评级 {{ pickRating }} · 隐蔽度 {{ lastConceal }} · 暴露 {{ lastExposure }}%</text>
                <text class="info-r" v-if="cleanLeft">善后窗口 {{ cleanLeft }}s：用窥镜/油墨擦清理痕迹（痕迹会带到下一局，巡逻更快）</text>
            </view>
            <view class="cipher" v-if="pickedPlain">
                <text class="c-h">解密后的情报原文</text>
                <text class="c-b">{{ pickedPlain }}</text>
            </view>
            <button class="btn primary" :disabled="acting" @tap="doDeliver">流转至交通站 → 总舵核验</button>
        </view>

        <!-- SEIZED -->
        <view class="panel seized" v-else-if="phase === 'SEIZED'">
            <text class="info-t bad">情报被巡逻人员取走 · 任务失败</text>
            <text class="info-r">{{ drop?.seizeReason || '超时未取，被巡查取走' }}</text>
            <view class="review">
                <text class="rv-t">截获复盘</text>
                <text class="rv-i">· 当时暴露度 {{ lastExposure }}%（证据合计 {{ evidenceTotal }} 点）</text>
                <text class="rv-i">· 巡逻状态：{{ patrolStateText }}</text>
                <text class="rv-i" v-if="evidenceList.length">· 留下的痕迹：{{ evidenceList.join('、') }}</text>
                <text class="rv-i">· 提示：{{ seizeTip }}</text>
            </view>
            <button class="btn ghost" @tap="doReset">重置暗点再试</button>
        </view>

        <!-- 投放表单 -->
        <view class="sheet" v-if="showForm" @tap.self="showForm = false">
            <view class="sheet-card">
                <text class="s-t">投放情报</text>
                <input class="inp" v-model="form.topic" placeholder="情报主题（如：城商行理财收益）" />
                <textarea class="area" v-model="form.plainText" placeholder="录入情报原文，落库即加密，前端只持密文" />
                <text class="s-l">留下便签标记（上线按此定位藏点）</text>
                <view class="marks">
                    <view v-for="m in markList" :key="m.k" class="mark" :class="{ on: form.marker === m.k }" @tap="form.marker = m.k">
                        <text>{{ m.t }}</text>
                    </view>
                </view>
                <text class="s-l">藏匿位置（由「藏信」工具点中的画面区域决定）：{{ placeZoneText }}<text class="s-dim" v-if="placeAt"> · 格 ({{ placeAt.gx }},{{ placeAt.gy }})</text></text>
                <text class="s-l" v-if="placeDriftText">便签指向：{{ placeDriftText }}</text>
                <text class="s-l">藏匿手法（决定隐蔽/速度/风险；含已入库自定义技能）· 当前有效风险 {{ effectiveStash(world, selMethod).risk }}</text>
                <view class="marks wrap">
                    <view
                        v-for="m in stashOptions"
                        :key="m.id"
                        class="mark"
                        :class="{ on: selMethod.id === m.id, locked: m.locked }"
                        @tap="pickMethod(m)"
                    >
                        <text>{{ m.locked ? '🔒 ' : '' }}{{ m.name }}{{ m.id.indexOf('ugc:') === 0 ? '·自' : '' }} {{ '★'.repeat(effectiveStash(world, m).risk) }}</text>
                    </view>
                </view>
                <text v-if="selMethod.combo" class="s-l combo">组合加成：{{ selMethod.combo }}</text>
                <text class="s-l">传递通道（决定风险；含已入库自定义技能）· 当前 {{ selChannel.risk }} 风险</text>
                <view class="marks wrap">
                    <view v-for="c in channelOptions" :key="c.id" class="mark" :class="{ on: selChannel.id === c.id }" @tap="form.channelId = c.id">
                        <text>{{ c.name }}{{ c.id.indexOf('ugc:') === 0 ? '·自' : '' }} {{ '★'.repeat(c.risk) }}</text>
                    </view>
                </view>
                <text class="s-l">暗号（从暗语本选一个，只口头告知接头人；取件人报错即被截获）</text>
                <view class="marks">
                    <view v-for="c in codeList" :key="c.k" class="mark" :class="{ on: form.code === c.k }" @tap="form.code = c.k">
                        <text>{{ c.t }}</text>
                    </view>
                </view>
                <text class="s-l" v-if="form.code">已选暗号：{{ (codeList.find((c) => c.k === form.code) || {}).t }}（{{ (codeList.find((c) => c.k === form.code) || {}).cat }}）</text>
                <view class="sheet-btns">
                    <button class="btn ghost" @tap="showForm = false">取消</button>
                    <button class="btn primary" :disabled="acting" @tap="doPlace">确认投放</button>
                </view>
            </view>
        </view>

        <!-- 人物故事会：说书人发放道具（初见馈赠 + 机缘解锁） -->
        <view class="sheet" v-if="storyOpen" @tap.self="storyOpen = false">
            <view class="sheet-card">
                <text class="s-t">人物故事会 · 说书人</text>
                <text class="story-npc">「闭馆后的图书馆，藏着不少门道。这些物件你拿去；另有几样，得靠机缘才给。」</text>
                <view class="story-offers">
                    <view v-for="o in storyOffers" :key="o.id" class="story-offer" :class="{ owned: hasProp(world, o.id) }">
                        <view class="so-t">{{ o.prop?.name || o.id }}<text class="so-need">{{ o.need }}</text></view>
                        <text class="so-d">{{ o.prop?.effect }}</text>
                        <button class="btn sm" :disabled="hasProp(world, o.id) || !o.ok" @tap="claimProp(o.id)">
                            {{ hasProp(world, o.id) ? '已持有' : o.ok ? '领取' : '机缘未到' }}
                        </button>
                    </view>
                </view>
                <view class="sheet-btns">
                    <button class="btn ghost" @tap="storyOpen = false">告辞</button>
                </view>
            </view>
        </view>

        <view class="foot">规则：时间锁 + 投放后不可回看 + 便签错置无法识别 + 暗号报错即被巡线截获 + 超时被巡查截获</view>

        <!-- 本轮增强：解谜/解码弹窗（藏·解 触发） -->
        <view class="sheet" v-if="puzzleOpen">
            <view class="sheet-card puzzle" :class="{ flash: puzzleFlash }">
                <text class="sc-t">{{ puzzleTitle }}</text>
                <text class="sc-hint">{{ puzzleHint }}</text>
                <input class="inp" v-model="puzzleInput" :placeholder="puzzlePlaceholder" @confirm="submitPuzzle" />
                <text class="pz-msg" v-if="puzzleMsg">{{ puzzleMsg }}</text>
                <view class="sheet-btns">
                    <button class="btn sm primary" @tap="submitPuzzle">破译</button>
                    <button class="btn sm ghost" @tap="puzzleOpen = false">放弃</button>
                </view>
            </view>
        </view>

        <!-- 本轮增强：通关评分浮层 -->
        <view class="sheet" v-if="scoreOpen">
            <view class="sheet-card score">
                <text class="sc-t">本局评定</text>
                <view class="score-seal" :class="{ ghost: !scoreInfo || !scoreInfo.ghost }">{{ scoreInfo ? scoreInfo.rating : '幽灵' }}</view>
                <view class="score-rows" v-if="scoreInfo">
                    <view class="sr"><text>最大连击</text><text class="sv">{{ scoreInfo.comboMax }}</text></view>
                    <view class="sr"><text>风险峰值</text><text class="sv">{{ scoreInfo.riskMaxPct }}%</text></view>
                    <view class="sr"><text>是否暴露</text><text class="sv" :class="{ warn: scoreInfo.spotted }">{{ scoreInfo.spotted ? '已被发现' : '零察觉' }}</text></view>
                    <view class="sr" v-if="scoreInfo.complete"><text>幽灵情报</text><text class="sv">已成形</text></view>
                </view>
                <view class="sheet-btns">
                    <button class="btn sm primary" @tap="scoreOpen = false">收下</button>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { DeadDropMarker } from '../../types/jianghu';
import { CODEBOOK, contextualBoard, PAINTING_POEM } from '../scene/codebook';
import { CLUE_SOURCES, assembleClues, type ClueSource } from '../scene/clues';
import { ATLAS_KEY, FRAMES, probeArt } from '../scene/assets';
import { ObjectPool } from '../scene/pool';
import { makeLibrary2dScene } from '../scene2d/Library2dScene';
import { PATROL_STATE_TEXT, patrolStep, witnessGain, type PatrolState } from '../scene/patrol';
import { seededPick } from '../scene/world';
import {
    blocksOf,
    clearLightestEvidence,
    clearHeaviestEvidence,
    createLibraryWorld,
    moveBlock,
    placeMarker,
    resetLibraryWorld,
    activeStashes,
    addEvidence,
    availableStashes,
    hasProp,
    propName,
    effectiveStash,
    pickTolerance,
    DISTRACT_MS,
    EXPOSURE_PER_SEVERITY,
    PATROL_BASE_SPEED,
    PATROL_ALERT_GAIN,
    skillToChannel,
    riskSeverity,
    DELIVERY_CHANNELS,
    PROPS,
    SKILL_CATEGORIES,
    deriveSeed,
    zoneLabel,
    effectiveDrift,
    markerCoveredByBlock,
    type SceneWorld
} from '../scene/world';

const jh = useJianghuStore();
const p = computed(() => jh.profile);
const drop = computed(() => jh.deadDrop);
const phase = computed(() => jh.deadDrop?.phase ?? 'IDLE');

const showForm = ref(false);
const acting = ref(false);
const pickedPlain = ref('');
/** 本次投放的落点：区域 + 等距格坐标（由「藏信」工具点中的画面位置决定） */
const placeAt = ref<{ zone: string; gx: number; gy: number } | null>(null);
const form = ref<{ topic: string; plainText: string; marker: DeadDropMarker; code: string; methodId: string; channelId: string }>({
    topic: '',
    plainText: '',
    marker: 'E',
    code: '',
    methodId: '',
    channelId: ''
});
/** 取件人报出的暗号 */
const pickCode = ref('');
/** 投放时选定的传递通道 id（取件阶段据此写证据链；doPlace 会清空 form，故单独持久化） */
const placedChannelId = ref('');
/** 投放时选定的暗号 key（显影剂/解码镜道具据此解密；doPlace 会清空 form，故单独持久化） */
const placedCodeKey = ref('');

const markList = [
    { k: 'E' as DeadDropMarker, t: '便签朝东' },
    { k: 'W' as DeadDropMarker, t: '便签朝西' },
    { k: 'S' as DeadDropMarker, t: '便签朝南' },
    { k: 'N' as DeadDropMarker, t: '便签朝北' }
];
/** 暗号可选列表：语境暗号（按种子分化）+ 经典切口（seed 于下方定义，故用 computed 延后求值） */
const codeHintText = computed(() => drop.value?.codeHint || '');
const codeTriesText = computed(() => (drop.value?.codeTriesLeft != null ? `剩余可报错 ${drop.value.codeTriesLeft} 次` : ''));

const phaseLabel = computed(
    () =>
        ({
            IDLE: '空信箱',
            PLACED: '已投放',
            PICKABLE: '可取窗',
            PICKED: '已取走',
            SEIZED: '已截获'
        }[phase.value])
);

const roleText = computed(() => {
    switch (phase.value) {
        case 'IDLE':
        case 'PLACED':
            return '投递人（你）';
        case 'PICKABLE':
        case 'PICKED':
            return '上线 · 云中君';
        default:
            return '—';
    }
});
const placeZoneText = computed(() => zoneLabel(placeAt.value?.zone));
/** 便签指向与落点的偏移说明（drift 越大寻点越难） */
const placeDriftText = computed(() => {
    if (!placeAt.value) return '';
    const mk = world.objects.marker;
    if (!mk || mk.state !== 'placed') return '未摆放便签（上线只能靠暗号与区域猜）';
    const d = effectiveDrift(world, placeAt.value.gx, placeAt.value.gy);
    const covered = markerCoveredByBlock(world);
    return d === 0
        ? '便签精确指向暗点（寻点最容易，但也更招摇）'
        : '便签与暗点偏 ' + d + ' 格（寻点更难，痕迹更少）' + (covered ? ' · 书堆压住便签：巡逻也看不见' : '');
});
/** 由 id 反查手法/通道名（投放态回显用） */
function methodName(id?: string): string {
    return stashOptions.value.find((m) => m.id === id)?.name || id || '';
}
function channelName(id?: string): string {
    return channelOptions.value.find((c) => c.id === id)?.name || id || '';
}

function fmtMin(diffMs: number): string {
    const m = Math.max(0, Math.ceil(diffMs / 60000));
    return m + ' 分钟';
}
const toPick = computed(() => (drop.value ? fmtMin(new Date(drop.value.pickableFrom).getTime() - new Date(jh.ddNowIso).getTime()) : ''));
const winLeft = computed(() => (drop.value ? fmtMin(new Date(drop.value.pickableTo).getTime() - new Date(jh.ddNowIso).getTime()) : ''));

/* ── P1 张力模型：暴露度（证据链 + 阶段）与可取时间窗 ── */
const evidenceTotal = computed(() => world.evidence.reduce((s, e) => s + e.severity, 0));
const exposure = computed(() => {
    let v = evidenceTotal.value * EXPOSURE_PER_SEVERITY;
    if (phase.value === 'PLACED' || phase.value === 'PICKABLE') v += 18;
    if (phase.value === 'SEIZED') return 100;
    return Math.max(0, Math.min(100, Math.round(v)));
});
/** 暴露度评级（难度反馈） */
const exposureLevel = computed(() => (exposure.value <= 30 ? '低' : exposure.value <= 60 ? '中' : exposure.value <= 80 ? '高' : '危'));
/** 取件评级：隐蔽度高且暴露低 → S */
const pickRating = computed(() =>
    lastExposure.value <= 40 && lastConceal.value >= 3 ? 'S' : lastExposure.value <= 70 && lastConceal.value >= 2 ? 'A' : 'B'
);
const windowText = computed(() => {
    if (phase.value === 'PICKABLE') return '开放中 · 剩余 ' + winLeft.value;
    if (phase.value === 'PLACED') return '未开放 · ' + toPick.value;
    return '待投放';
});
/** 巡逻警觉度（与场景 alertLevel 同口径，供怀表读取；书堆压住便签则巡逻看不见） */
const patrolAlert = computed(() => {
    let v = evidenceTotal.value * 0.12;
    if (world.objects.marker?.state === 'placed' && !markerCoveredByBlock(world)) v += 0.2;
    return Math.max(0, Math.min(1, v));
});
const patrolAlertPct = computed(() => Math.round(patrolAlert.value * 100));

/* ── 巡逻 AI HUD 与截获复盘（P2） ── */
/** 场景巡逻状态（scene/patrol.ts 状态机镜像，供 HUD / 复盘展示） */
const patrolStateText = ref('例行巡逻');
const patrolRiskPct = ref(0);
/** 证据链可读清单（复盘：哪条痕迹害了你） */
const evidenceList = computed(() =>
    world.evidence.map((e) => {
        const kind = e.kind.indexOf('stash:') === 0 ? '藏匿手法' : e.kind.indexOf('channel:') === 0 ? '传递通道' : e.kind === 'mis-tap' ? '误点暗点' : e.kind === 'prop:bookmark' ? '书签留痕' : e.kind;
        return kind + ' +' + e.severity;
    })
);
/** 截获原因 → 下次怎么改 */
const seizeTip = computed(() => {
    const r = drop.value?.seizeReason || '';
    if (r.indexOf('暗号') >= 0) return '暗号要凭线索拼：先查书架/背景画/借阅卡，凑齐来源再报号。';
    if (r.indexOf('超时') >= 0) return '别让可取窗空过：到窗就用「取·收」点开信函并尽快报号。';
    if (r.indexOf('过慢') >= 0) return '换取用速度更快的手法（书架夹缝/桌底磁贴），或夹书签提速。';
    if (r.indexOf('管理员') >= 0) return '管理台/闭架区最危险：改用书架区或阅览区藏点，或等管理员离场。';
    if (r.indexOf('巡逻') >= 0) return '少留痕迹：用窥镜抹痕、假书脊/权限卡等高隐蔽手法，别乱点格子。';
    return '降低暴露度再试：证据越少，巡逻越慢。';
});

/* ── 动作 ── */
/**
 * 打开投放表单：zone/gx/gy 为「藏信」工具点中的画面位置（不传则默认书架区 1,1）。
 * 自动把藏匿手法切到该区域首个未置灰项，保证「点到哪就藏到哪」。
 */
function openForm(zone = 'bookshelf', gx = 1, gy = 1) {
    placeAt.value = { zone, gx, gy };
    const first = stashOptions.value.find((m) => m.zone === zone && !m.locked);
    if (first) form.value.methodId = first.id;
    showForm.value = true;
}
async function doPlace() {
    if (!form.value.topic.trim() || !form.value.plainText.trim()) {
        return uni.showToast({ title: '请填写主题与情报原文', icon: 'none' });
    }
    if (!form.value.code) {
        return uni.showToast({ title: '请从暗语本中选一个暗号', icon: 'none' });
    }
    const at = placeAt.value || { zone: 'bookshelf', gx: 1, gy: 1 };
    acting.value = true;
    try {
        const method = selMethod.value;
        const channel = selChannel.value;
        const eff = effectiveStash(world, method); // 组合后有效属性：隐蔽手法/窥镜降风险 → 少留证据
        // 便签指向与暗点格的偏移：drift 越大取件寻点越难（识别系统输入）
        const drift = effectiveDrift(world, at.gx, at.gy);
        await jh.placeDeadDrop({
            topic: form.value.topic,
            plainText: form.value.plainText,
            marker: form.value.marker,
            code: form.value.code,
            methodId: method.id,
            channelId: channel.id,
            zone: at.zone,
            gx: at.gx,
            gy: at.gy,
            conceal: eff.conceal,
            markerDrift: drift
        });
        topicHint.value = form.value.topic;
        // 藏匿手法（有效）风险 → 写入证据链（驱动暴露度 / 巡逻 / 截获）
        addEvidence(world, method.zone || 'custom', 'stash:' + method.id, riskSeverity(eff.risk));
        // 记住所选传递通道，供取件阶段写入证据链
        placedChannelId.value = channel.id;
        // 记住所选暗号，供显影剂 / 解码镜道具破解
        placedCodeKey.value = form.value.code;
        revealedCode.value = '';
        const m = world.objects.marker;
        if (m.state !== 'placed') placeMarker(world, 3, 3, form.value.marker);
        else m.data.orient = form.value.marker;
        showForm.value = false;
        form.value = { topic: '', plainText: '', marker: 'E', code: '', methodId: '', channelId: '' };
        pickCode.value = '';
        uni.showToast({ title: '情报已入暗点，已离场', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '投放失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function doPickup() {
    if (!pickCode.value) {
        return uni.showToast({ title: '请先报出暗号', icon: 'none' });
    }
    if (!letterOpened.value) {
        return uni.showToast({ title: '先用「取·收」工具点开暗点里的信函', icon: 'none' });
    }
    acting.value = true;
    try {
        // 取件奖励按「本次藏点隐蔽度」与「当前暴露度」结算
        const placedMethod = stashOptions.value.find((m) => m.id === drop.value?.methodId) || selMethod.value;
        const eff = effectiveStash(world, placedMethod);
        // 书签便利：夹过书签的藏点更好取（隐蔽度 +1，上限 3）
        const conceal = Math.min(3, eff.conceal + (markBoost.value ? 1 : 0));
        lastConceal.value = conceal;
        lastExposure.value = exposure.value;
        const r = await jh.pickupDeadDrop(pickCode.value, { conceal, exposure: exposure.value });
        pickedPlain.value = r.plainText;
        pickedOnce.value = true;
        stopPickCost();
        startCleanWindow(30);
        // 取件阶段：投放时选定的传递通道风险 → 写入证据链（可取窗暴露度随通道风险上升）
        const ch = channelOptions.value.find((c) => c.id === placedChannelId.value) || selChannel.value;
        addEvidence(world, 'custom', 'channel:' + ch.id, riskSeverity(ch.risk));
        uni.showToast({ title: '取件成功 +' + r.rewardRep + ' 声望（隐蔽度 ' + eff.conceal + '）', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '取件失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function doDeliver() {
    acting.value = true;
    try {
        // 录音笔取证：每局最多折算一次 +5 声望加成
        const bonus = recorderNotes.value.length ? 5 : 0;
        const r = await jh.deliverDeadDrop(bonus);
        deliveredOnce.value = true;
        recorderNotes.value = [];
        bumpRound();
        uni.showToast({ title: '已抵总舵核验 +' + r.rewardRep + ' 声望' + (bonus ? '（含取证 +' + bonus + '）' : ''), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '流转失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function ff(min: number) {
    await jh.fastForwardDeadDrop(min);
}
async function doReset() {
    await jh.resetDeadDrop();
    pickedPlain.value = '';
    pickCode.value = '';
    placedChannelId.value = '';
    placedCodeKey.value = '';
    revealedCode.value = '';
    recorderNotes.value = [];
    markBoost.value = 0;
    armedStash.value = null;
    spyNote.value = '';
    earplugOn.value = false;
    letterOpened.value = false;
    stopPickCost();
    if (cleanTimer) clearInterval(cleanTimer);
    cleanLeft.value = 0;
    jh.clearClues();
    resetLibraryWorld(world);
    if (sceneRef.value) sceneRef.value.seizeTriggered = false;
    uni.showToast({ title: '暗点已重置', icon: 'none' });
}

/* ── 工具 ── */
type Tool = 'hand' | 'hide' | 'mark' | 'use' | 'pick' | 'person';
const tool = ref<Tool>('hand');
/** 工具按阶段/持有态联动启用；关闭时点击给出引导 */
const toolEnabled = computed(() => ({
    hand: true,
    // 已投放/已取走/已截获 → 不能再投（避免一局多点投放）
    hide: phase.value === 'IDLE',
    mark: phase.value === 'IDLE' || phase.value === 'PLACED',
    // 「物·用」需要持有道具
    use: ownedProps.value.length > 0,
    // 「取·收」仅可取窗（上线身份）
    pick: phase.value === 'PICKABLE',
    person: true
}));
function setTool(t: Tool) {
    const en = toolEnabled.value as Record<string, boolean>;
    if (!en[t]) {
        const why =
            t === 'pick' ? '尚未到可取窗口（投放后需等待，或用「快进到可取窗口」演示）' : t === 'hide' ? '已有情报在暗点中，先重置再投' : t === 'use' ? '背包空空的，去「人物故事会」领道具' : '当前阶段不可用';
        sceneRef.value?.flash(why);
        return;
    }
    tool.value = t;
}

/* ── 桌子动作条（2D 场景：短按大阅览桌弹出） ── */
const tableAct = ref<{ open: boolean; id: string; flipped: boolean; top: string[]; under: string[]; busy: boolean }>({
    open: false,
    id: 'reading-1',
    flipped: false,
    top: [],
    under: [],
    busy: false
});
function onTableTap(id: string, flipped: boolean) {
    const info = sceneRef.value?.tableInfo ? sceneRef.value.tableInfo(id) : null;
    tableAct.value = {
        open: true,
        id,
        flipped,
        top: info?.top ?? [],
        under: info?.under ?? [],
        busy: false
    };
}
function doFlipTable() {
    const sc = sceneRef.value;
    if (!sc || tableAct.value.busy) return;
    tableAct.value.busy = true;
    const ok = sc.flipTable(tableAct.value.id);
    tableAct.value.busy = false;
    // 翻面是补间动画：这里只乐观置位，最终状态由 onTableChanged 回调校正
    if (ok) {
        const info = sc.tableInfo ? sc.tableInfo(tableAct.value.id) : null;
        tableAct.value.flipped = info?.state === 'flipped';
        tableAct.value.top = info?.top ?? [];
        tableAct.value.under = info?.under ?? [];
    }
}
/** 翻面动画结束：校正动作条状态 */
function onTableChanged(id: string, flipped: boolean) {
    if (!tableAct.value.open || tableAct.value.id !== id) return;
    const sc = sceneRef.value;
    const info = sc?.tableInfo ? sc.tableInfo(id) : null;
    tableAct.value.flipped = flipped;
    tableAct.value.top = info?.top ?? [];
    tableAct.value.under = info?.under ?? [];
}
function doTakeFromUnder() {
    const sc = sceneRef.value;
    if (!sc) return;
    sc.takeFromTableUnder(tableAct.value.id);
    const info = sc.tableInfo ? sc.tableInfo(tableAct.value.id) : null;
    tableAct.value.under = info?.under ?? [];
}
const bagOpen = ref(false);
/** 人物故事会 NPC 面板 */
const storyOpen = ref(false);
/** 条件解锁标记（会话内） */
const pickedOnce = ref(false);
const deliveredOnce = ref(false);
/** 新手引导 */
const showOnboard = ref(true);
const guideDone = ref(false);
/** 上次取件的隐蔽度 / 暴露度（评级反馈） */
const lastConceal = ref(2);
const lastExposure = ref(40);
/** 场景异常提示（2D：书开着 / 桌翻着 / 书掉地上） */
const anomalyHint = ref('');
watch(anomalyHint, (v) => {
    if (!v) return;
    const t = setTimeout(() => (anomalyHint.value = ''), 4000);
    return () => clearTimeout(t);
});

/* ── 本轮增强：潜行/解谜/环境/组合/评分 的浮层状态 ── */
const alertVal = ref(0);
const inSight = ref(false);
const lampOn = ref(true);
const uvOn = ref(false);
const uvUnlocked = ref(false);
/** 线索链面板（展示解谜/道具相互解锁进度） */
const clueOpen = ref(false);
const clueChain = ref<any[]>([]);
/** 刚解锁的线索行（用于高光闪一下） */
const justUnlocked = ref<Record<string, boolean>>({});
/** 线索链里某节点从「未解锁」变为「已解锁」时，让该行高光闪一下 */
watch(clueChain, (cur: any[], prev: any[]) => {
    const prevMap: Record<string, boolean> = {};
    (prev || []).forEach((c) => (prevMap[c.id] = c.unlocked));
    (cur || []).forEach((c) => {
        if (c.unlocked && !prevMap[c.id]) {
            justUnlocked.value = { ...justUnlocked.value, [c.id]: true };
            setTimeout(() => {
                justUnlocked.value = { ...justUnlocked.value, [c.id]: false };
            }, 1300);
        }
    });
});
/** 交互反馈态 */
const uvShake = ref(false);
const uvBubble = ref('');
const puzzleFlash = ref(false);
const spottedFlash = ref(false);
const shakeStage = ref(false);
const prevSpotted = ref(false);
const distractSec = ref(0);
const puzzleOpen = ref(false);
const puzzleKind = ref<'decode' | 'riddle' | 'lock'>('decode');
const puzzleTitle = ref('解码暗格');
const puzzleHint = ref('');
const puzzlePlaceholder = ref('');
const puzzleInput = ref('');
const puzzleMsg = ref('');
const scoreOpen = ref(false);
const scoreInfo = ref<any>(null);
const puzzleSolvedFlags = ref<Record<string, boolean>>({});
/** 当前场景实例（同时挂在 window.__jhScene 上供断言） */
function sc(): any {
    return sceneRef.value as any;
}
function toggleLamp() {
    const s = sc();
    if (s) s.setLamp(!s.lampOn);
}
function toggleUV() {
    const s = sc();
    if (!s) return;
    const ok = s.toggleUV();
    if (!ok) {
        uvBubble.value = '先解出暗格密码锁（本地端口后四位）拿到台灯电池';
        uvShake.value = true;
        setTimeout(() => (uvShake.value = false), 420);
        setTimeout(() => (uvBubble.value = ''), 2300);
    }
}
function doDistract() {
    const s = sc();
    if (s) s.doDistract();
}
function showScore() {
    const s = sc();
    if (s) scoreInfo.value = s.getScoreSummary();
    scoreOpen.value = true;
}
function openPuzzle(kind: 'decode' | 'riddle' | 'lock') {
    puzzleKind.value = kind;
    puzzleInput.value = '';
    puzzleMsg.value = '';
    if (kind === 'decode') {
        puzzleTitle.value = '密码本解码';
        puzzleHint.value = '密钥藏在某本书的某一页：翻开书、翻到线索页即可破译密文';
        puzzlePlaceholder.value = 'CODE-XXXX';
    } else if (kind === 'riddle') {
        puzzleTitle.value = '书中谜题';
        puzzleHint.value = (s && s.getRiddleHint) ? s.getRiddleHint() : '「白纸黑字，藏于乌有；落笔成痕，洗之不去」打一字';
        puzzlePlaceholder.value = '一个字';
    } else {
        puzzleTitle.value = '暗格密码锁';
        puzzleHint.value = '暗格三位门禁号（本地服务端口后四位）';
        puzzlePlaceholder.value = '例如 5181';
    }
    puzzleOpen.value = true;
}
function submitPuzzle() {
    const s = sc();
    if (!s) return;
    const ok = s.solvePuzzle(puzzleKind.value, puzzleInput.value);
    if (ok) {
        puzzleFlash.value = true;
        // 先亮起成功高光，短暂延时再收起弹窗（否则 v-if 卸载会让闪光看不见）
        setTimeout(() => {
            puzzleFlash.value = false;
            puzzleOpen.value = false;
        }, 360);
    } else puzzleMsg.value = '不对，再想想';
}
/** 每帧从场景同步可见状态到浮层 */
let sceneTick: any = 0;
function startSceneTick() {
    clearInterval(sceneTick);
    sceneTick = setInterval(() => {
        const s = sc();
        if (!s) return;
        alertVal.value = s.stealthAlert || 0;
        inSight.value = !!s.inSight;
        lampOn.value = !!s.lampOn;
        uvOn.value = !!s.uvMode;
        uvUnlocked.value = !!s.uvUnlocked;
        if (s.getClueChain) clueChain.value = s.getClueChain();
        puzzleSolvedFlags.value = s.puzzleSolved || {};
        distractSec.value = s.distractActive ? Math.max(0, Math.ceil((s.distractUntilMs - performance.now()) / 1000)) : 0;
        // 被发现瞬间：红闪 + 震屏（仅上升沿触发一次）
        const spottedNow = !!(s.spotted);
        if (spottedNow && !prevSpotted.value) {
            spottedFlash.value = true;
            shakeStage.value = true;
            setTimeout(() => (spottedFlash.value = false), 520);
            setTimeout(() => (shakeStage.value = false), 420);
        }
        prevSpotted.value = spottedNow;
    }, 150);
}
function stopSceneTick() {
    clearInterval(sceneTick);
}
const rankNum = computed(() => {
    const m = /L(\d)/.exec(jh.profile?.rankCode || '');
    return m ? Number(m[1]) : 1;
});
const propById = (id: string) => PROPS.find((pr) => pr.id === id);
/** NPC 道具报价：初见馈赠（无条件）+ 机缘解锁（达成条件可领） */
const storyOffers = computed(() =>
    [
        { id: 'bookmark', need: '初见馈赠', ok: true },
        { id: 'magnet', need: '初见馈赠', ok: true },
        { id: 'earplug', need: '初见馈赠', ok: true },
        { id: 'spyglass', need: '首次成功取件', ok: pickedOnce.value },
        { id: 'distraction', need: '首次成功取件', ok: pickedOnce.value },
        { id: 'sandglass', need: '首次成功取件', ok: pickedOnce.value },
        { id: 'decode-glass', need: '首次流转总舵', ok: deliveredOnce.value },
        { id: 'ink-eraser', need: '首次流转总舵', ok: deliveredOnce.value },
        { id: 'chalk', need: '首次流转总舵', ok: deliveredOnce.value },
        { id: 'flashlight', need: '段位 L3 及以上', ok: rankNum.value >= 3 },
        { id: 'stool', need: '段位 L2 及以上', ok: rankNum.value >= 2 },
        { id: 'decoy-envelope', need: '段位 L4 及以上', ok: rankNum.value >= 4 },
        { id: 'staff-card', need: '段位 L5 及以上', ok: rankNum.value >= 5 }
    ].map((o) => ({ ...o, prop: propById(o.id) }))
);
function claimProp(id: string) {
    if (hasProp(world, id)) {
        uni.showToast({ title: '已在背包中', icon: 'none' });
        return;
    }
    const offer = storyOffers.value.find((o) => o.id === id);
    if (offer && !offer.ok) {
        uni.showToast({ title: '机缘未到：' + offer.need, icon: 'none' });
        return;
    }
    if (jh.grantProp(id)) uni.showToast({ title: '领取成功：' + (propById(id)?.name || id), icon: 'none' });
}

/* ── 道具实玩：每个道具都能被主动使用，并产生可见效果 ── */
/** 显影剂/解码镜破解出的暗号 key */
const revealedCode = ref('');
const revealedCodeText = computed(() => codeList.value.find((c) => c.k === revealedCode.value)?.t || '');
/** 录音笔取证条目（交付时折算声望） */
const recorderNotes = ref<string[]>([]);
/** 书签便利（双刃：同时留下痕迹） */
const markBoost = ref(0);
/** 道具解锁的藏点（名+手法 id），用于展示「藏点就位」 */
const armedStash = ref<{ id: string; name: string } | null>(null);
/** 窥镜一次性反馈（抹去痕迹的可见回执） */
const spyNote = ref('');
/** 耳塞开关（戴上后本局不录耳语，也无法录取听） */
const earplugOn = ref(false);
/** 计时型效果的剩余秒数 */
const distractLeft = ref(0);
const watchLeft = ref(0);
const lightLeft = ref(0);
const cdTimers: Record<string, any> = {};
function armCountdown(key: 'distract' | 'watch' | 'light', sec: number) {
    const r = key === 'distract' ? distractLeft : key === 'watch' ? watchLeft : lightLeft;
    r.value = sec;
    if (cdTimers[key]) clearInterval(cdTimers[key]);
    cdTimers[key] = setInterval(() => {
        if (r.value > 0) r.value -= 1;
        if (r.value <= 0) {
            clearInterval(cdTimers[key]);
            cdTimers[key] = 0;
        }
    }, 1000);
}
function clearCountdowns() {
    Object.keys(cdTimers).forEach((k) => {
        if (cdTimers[k]) clearInterval(cdTimers[k]);
        cdTimers[k] = 0;
    });
}

/** 每个道具的主动动作文案 */
const PROP_ACTION: Record<string, string> = {
    card: '刷开夹层',
    magnet: '吸附桌底',
    developer: '显影暗号',
    'fake-spine': '造新藏点',
    flashlight: '照亮暗角',
    distraction: '抛出引开',
    'staff-card': '刷开闭架',
    spyglass: '远观抹痕',
    'pocket-watch': '读巡逻节拍',
    recorder: '录音取证',
    bookmark: '夹书签',
    'decode-glass': '透视夹层',
    stool: '攀高开窗',
    'ink-eraser': '擦最重痕',
    'decoy-envelope': '放诱饵信',
    sandglass: '延可取窗',
    earplug: '戴耳塞',
    chalk: '画误导记'
};
/** 一次性道具动作文案后缀提示 */
const CONSUMABLE_HINT: Record<string, string> = {
    'ink-eraser': '（一次性）',
    'decoy-envelope': '（一次性）',
    sandglass: '（一次性）'
};
function propActionText(id: string) {
    return PROP_ACTION[id] + (CONSUMABLE_HINT[id] || '') || '使用';
}

/* ── 手与画面结合：道具执行链 + 取信三步（P1） ── */
/** 「物·用」工具：角色先走到目标处，再取用该道具（落地感） */
async function usePropAt(propId: string, gx: number, gy: number) {
    if (!hasProp(world, propId)) {
        sceneRef.value?.flash('尚未持有「' + propName(propId) + '」，去「人物故事会」领取');
        return;
    }
    const s: any = sceneRef.value;
    // 本轮增强：部分道具直接驱动场景机制（解谜 / 开抽屉 / 吸桌底 / 引开馆员）
    if (propId === 'decode-glass') {
        openPuzzle('decode');
        return;
    }
    if (propId === 'staff-card') {
        if (s) s.openDeskDrawer();
        return;
    }
    if (propId === 'magnet') {
        if (s) s.magnetStickHeld();
        return;
    }
    if (propId === 'distraction') {
        if (s) s.doDistract();
        return;
    }
    if (s) {
        const ok = await s.walkToCell(gx, gy);
        if (!ok) s.flash('过不去，换个位置');
    }
    await useProp(propId);
}

/** 信函是否已点开（走到暗点附近用「取·收」点开后才可报号） */
const letterOpened = ref(false);
/** 取件耗时剩余秒数（手法 speed 越慢越久，超时被巡逻抢先） */
const pickCostLeft = ref(0);
let pickCostTimer: any = 0;

/** 取件耗时（秒）：基础 6s + 取用速度惩罚 − 书签便利 1s */
function pickCostSec(): number {
    const d = drop.value;
    const placedMethod = stashOptions.value.find((m) => m.id === d?.methodId) || selMethod.value;
    const eff = effectiveStash(world, placedMethod);
    return Math.max(3, 6 + (3 - eff.speed) * 2 - (markBoost.value ? 1 : 0));
}
function startPickCost() {
    pickCostLeft.value = pickCostSec();
    if (pickCostTimer) clearInterval(pickCostTimer);
    pickCostTimer = setInterval(() => {
        if (pickCostLeft.value > 0) pickCostLeft.value -= 1;
        if (pickCostLeft.value <= 0) {
            clearInterval(pickCostTimer);
            pickCostTimer = 0;
            jh.failDeadDrop('取件过慢，巡逻先到').catch(() => {});
        }
    }, 1000);
}
function stopPickCost() {
    if (pickCostTimer) clearInterval(pickCostTimer);
    pickCostTimer = 0;
    pickCostLeft.value = 0;
}

/* ── 善后窗口 + 自适应难度（P3） ── */
/** 取件后的善后窗口剩余秒数（期间清痕迹影响下一局） */
const cleanLeft = ref(0);
let cleanTimer: any = 0;
function startCleanWindow(sec = 30) {
    cleanLeft.value = sec;
    if (cleanTimer) clearInterval(cleanTimer);
    cleanTimer = setInterval(() => {
        if (cleanLeft.value > 0) cleanLeft.value -= 1;
        if (cleanLeft.value <= 0 && cleanTimer) {
            clearInterval(cleanTimer);
            cleanTimer = 0;
        }
    }, 1000);
}
/** 已完成局数（持久化）：驱动自适应难度 */
const ROUNDS_KEY = 'jianghu_rounds_v1';
const rounds = ref(0);
try {
    rounds.value = Number(uni.getStorageSync(ROUNDS_KEY) || 0) || 0;
} catch {
    rounds.value = 0;
}
/** 自适应难度系数：每局 +5%（巡逻更快、管理员巡查更频） */
const difficulty = computed(() => 1 + rounds.value * 0.05);
function bumpRound() {
    rounds.value += 1;
    try {
        uni.setStorageSync(ROUNDS_KEY, rounds.value);
    } catch {
        /* ignore */
    }
    sceneRef.value?.setDifficulty(difficulty.value);
}

/** 闭馆管理员截获（重罚：-20 声望） */
async function adminSeize() {
    if (seizeGuard) return;
    seizeGuard = true;
    sceneRef.value?.flash('闭馆管理员巡到闭架区，取走密页（重罚）');
    try {
        await jh.failDeadDrop('闭馆管理员巡查闭架区，密页被取走', 20);
    } catch {
        /* 已终态则忽略 */
    } finally {
        seizeGuard = false;
    }
}
/** 巡逻员截获（AI 状态机 / 演示按钮）：进 SEIZED 终态并复盘 */
async function patrolSeizeNow(reason: string) {
    if (seizeGuard) return;
    seizeGuard = true;
    try {
        await jh.failDeadDrop(reason);
    } catch {
        /* ignore */
    } finally {
        seizeGuard = false;
    }
}
let seizeGuard = false;

/** 「取·收」工具：命中暗点格 → 开信；点错 → 脚步声写进证据链 */
function pickAt(gx: number, gy: number) {
    const d = drop.value;
    (window as any).__pickCalls = ((window as any).__pickCalls || 0) + 1; // TEMP-DEBUG
    (window as any).__pickLast = { gx, gy, phase: d?.phase, dropGx: d?.gx, dropGy: d?.gy, t: tool.value }; // TEMP-DEBUG
    if (!d || d.phase !== 'PICKABLE') {
        sceneRef.value?.flash('尚未到可取窗口');
        return;
    }
    const tol = pickTolerance(d.markerDrift ?? -1);
    const dist = Math.abs((d.gx ?? -99) - gx) + Math.abs((d.gy ?? -99) - gy);
    const near = tol < 0 ? sceneRef.value?.playerNearCell(gx, gy, 1) : true;
    if (dist <= Math.max(0, tol) && near) {
        letterOpened.value = true;
        startPickCost();
        sceneRef.value?.flash('信函已开：报出接头暗号（限时 ' + pickCostSec() + 's）');
        uni.showToast({ title: '信函已开，报暗号', icon: 'none' });
        return;
    }
    addEvidence(world, d.zone || 'custom', 'mis-tap', 1);
    sceneRef.value?.flash('点错了：脚步声惊动巡逻（暴露度 +11%）');
    uni.showToast({ title: '点错了，暴露度上升', icon: 'none' });
}
/** 道具解锁类效果：直接把藏匿手法切换到位 */
function armStash(propId: string, methodId: string) {
    const opt = stashOptions.value.find((m) => m.id === methodId && !m.locked);
    if (!opt) {
        sceneRef.value?.flash('当前局面用不上「' + propName(propId) + '」');
        uni.showToast({ title: '当前局面用不上此物', icon: 'none' });
        return false;
    }
    form.value.methodId = methodId;
    armedStash.value = { id: methodId, name: opt.name };
    sceneRef.value?.flash(opt.name + ' 已就位（' + propName(propId) + '）');
    uni.showToast({ title: '已启用：' + opt.name, icon: 'none' });
    return true;
}
/** 使用道具：统一入口（背包点「使用」即触发） */
async function useProp(id: string) {
    if (!hasProp(world, id)) {
        uni.showToast({ title: '尚未持有「' + propName(id) + '」', icon: 'none' });
        return;
    }
    const sc = sceneRef.value;
    const now = sc?.time?.now ?? 0;
    switch (id) {
        case 'distraction':
            sc?.useDistraction();
            armCountdown('distract', DISTRACT_MS / 1000);
            break;
        case 'spyglass': {
            const sev = clearLightestEvidence(world);
            sc?.propFx('spyglass');
            if (sev) {
                spyNote.value = '窥镜抹痕 −' + sev * EXPOSURE_PER_SEVERITY + '% 暴露';
                sc?.flash('窥镜远观：抹去一处蛛丝马迹，暴露度 −' + sev * EXPOSURE_PER_SEVERITY + '%');
                uni.showToast({ title: '抹去一处痕迹，暴露度下降', icon: 'none' });
            } else {
                sc?.flash('窥镜远观：暂无可抹去的痕迹');
                uni.showToast({ title: '暂无可抹去的痕迹', icon: 'none' });
            }
            break;
        }
        case 'pocket-watch': {
            sc?.setWatchUntil(now + 15000);
            armCountdown('watch', 15);
            sc?.flash('怀表读秒：巡逻节拍已预判，15 秒内警觉减半');
            uni.showToast({ title: '巡逻节拍已预判（15s）', icon: 'none' });
            break;
        }
        case 'flashlight': {
            sc?.setLightUntil(now + 10000);
            armCountdown('light', 10);
            sc?.flash('手电照暗角：夹层题诗「' + PAINTING_POEM + '」显形，10 秒内巡逻难辨');
            uni.showToast({ title: '暗角已照亮（10s）', icon: 'none' });
            break;
        }
        case 'developer':
        case 'decode-glass': {
            if (!placedCodeKey.value) {
                sc?.flash('暂无可显影的密写：先投放一份情报');
                uni.showToast({ title: '须先投放情报', icon: 'none' });
                break;
            }
            revealedCode.value = placedCodeKey.value;
            sc?.propFx('developer');
            sc?.flash('显影：接头暗号「' + revealedCodeText.value + '」');
            uni.showToast({ title: '显影成功：' + revealedCodeText.value, icon: 'none' });
            break;
        }
        case 'bookmark': {
            markBoost.value += 1;
            addEvidence(world, 'reading', 'prop:bookmark', 1);
            sc?.flash('书签夹入藏点：取件更便利 +1，也留下翻阅痕迹（+1 证据）');
            uni.showToast({ title: '书签已夹入（便利+1／痕迹+1）', icon: 'none' });
            break;
        }
        case 'recorder': {
            if (earplugOn.value) {
                sc?.flash('戴着耳塞，录不到耳语（取下耳塞再录）');
                uni.showToast({ title: '耳塞堵着耳朵', icon: 'none' });
                break;
            }
            if (phase.value === 'IDLE' || phase.value === 'SEIZED') {
                sc?.flash('先投放情报，才有耳语可录');
                uni.showToast({ title: '先投放情报再录音', icon: 'none' });
                break;
            }
            recorderNotes.value.push((topicHint.value || '密页耳语') + ' · 第 ' + (recorderNotes.value.length + 1) + ' 段');
            sc?.propFx('recorder');
            uni.showToast({ title: '已录一段取证（交付 +5 声望）', icon: 'none' });
            break;
        }
        case 'magnet':
            armStash(id, 'desk-magnet');
            break;
        case 'card':
            armStash(id, 'card-slot');
            break;
        case 'staff-card':
            armStash(id, 'closed-shelf');
            break;
        case 'fake-spine':
            armStash(id, 'fake-spine');
            break;
        case 'stool':
            armStash(id, 'vent');
            break;
        case 'ink-eraser': {
            const sev = clearHeaviestEvidence(world);
            sc?.propFx('eraser');
            if (sev) {
                spyNote.value = '油墨擦抹去最重痕迹 −' + sev * EXPOSURE_PER_SEVERITY + '% 暴露';
                sc?.flash('擦去最显眼的一处痕迹，暴露度 −' + sev * EXPOSURE_PER_SEVERITY + '%');
                uni.showToast({ title: '已擦去最重痕迹', icon: 'none' });
            } else {
                sc?.flash('没有可擦的痕迹');
                uni.showToast({ title: '没有可擦的痕迹', icon: 'none' });
            }
            await jh.removeProp(id);
            break;
        }
        case 'decoy-envelope': {
            // 在暗点附近 2~3 格放一枚假信封：巡逻检查优先扑空
            const d = drop.value;
            if (!d || d.gx == null) {
                sc?.flash('先投放情报，诱饵才有意义');
                uni.showToast({ title: '先投放情报', icon: 'none' });
                break;
            }
            callScene('setDecoy', d.gx + 2, d.gy);
            await jh.removeProp(id);
            break;
        }
        case 'sandglass': {
            try {
                await jh.extendDeadDrop(5);
                uni.showToast({ title: '可取窗 +5 分钟', icon: 'none' });
                sc?.flash('时间沙漏：可取窗延长 5 分钟');
            } catch (e: any) {
                uni.showToast({ title: (e?.message || '仅可取窗可延长').slice(0, 30), icon: 'none' });
            }
            await jh.removeProp(id);
            break;
        }
        case 'earplug': {
            earplugOn.value = !earplugOn.value;
            sc?.flash(earplugOn.value ? '戴上耳塞：本局耳语不再被记录（也无法录取听）' : '取下耳塞');
            uni.showToast({ title: earplugOn.value ? '耳塞已戴' : '耳塞已取下', icon: 'none' });
            break;
        }
        case 'chalk': {
            // 粉笔：在背景画区域留误导记号，把巡逻引进错误区域 6 秒
            callScene('chalkMark', 2, 0);
            break;
        }
        default:
            sc?.flash('此物暂无主动用法');
    }
}
/** 生效中的道具效果（可见反馈条） */
const activeEffects = computed(() => {
    const list: { k: string; t: string }[] = [];
    if (distractLeft.value) list.push({ k: 'd', t: '干扰物引开巡逻 · 剩 ' + distractLeft.value + 's' });
    if (watchLeft.value) list.push({ k: 'w', t: '怀表预判节拍 · 警觉减半 剩 ' + watchLeft.value + 's' });
    if (lightLeft.value) list.push({ k: 'l', t: '手电照明暗角 · 剩 ' + lightLeft.value + 's' });
    if (revealedCodeText.value) list.push({ k: 'r', t: '显影：暗号「' + revealedCodeText.value + '」' });
    if (recorderNotes.value.length) list.push({ k: 'n', t: '录音取证 ' + recorderNotes.value.length + ' 段 · 交付 +5 声望' });
    if (markBoost.value) list.push({ k: 'b', t: '书签便利 +' + markBoost.value + '（已留痕）' });
    if (armedStash.value) list.push({ k: 'a', t: '藏点就位：' + armedStash.value.name });
    if (spyNote.value) list.push({ k: 's', t: spyNote.value });
    return list;
});
/** 未持有的道具（引导去故事会） */
const missingProps = computed(() => PROPS.filter((pr) => !hasProp(world, pr.id)));

const toolHint = computed(
    () =>
        ({
            hand: '直接拿起：按住书/书堆/梯凳即可拖动，松手落到最近的书架层、桌面或地面；短按书本可翻开，翻开的书页间能藏东西。',
            hide: '点击画面里的书架/背景画/阅览桌/管理台，就在该区域投放；手法会自动切到该区域可用项。',
            mark: '点击空地放便签标记；再次点同一格循环朝向：东→南→西→北。',
            use: '点场景物体直接取用对应道具（书架=假书脊/背景画=解码镜/阅览桌=磁贴/管理台=权限卡）。',
            pick: '走到暗点附近点开信函，再报暗号取件；点错格会留下脚步声（暴露度上升）。',
            person: '点地面让角色走过去；取道具/放便签前角色会先走到目标再执行。'
        }[tool.value]) ?? '空白处拖动可平移视野，滚轮/双指捏合可缩放。'
);

/* ── 操作手册数据（藏/传/道具/技能 三维度 + 技能系统） ── */
const opOpen = ref(false);
const opTab = ref<'藏' | '传' | '道具' | '技能'>('藏');
const isUgc = (id: string) => id.indexOf('ugc:') === 0;
/** 已入库自定义技能（运营审核 approved，多人共享）——来自 store */
const approvedUgc = computed(() => jh.customSkills.filter((s) => s.status === 'approved'));
/** 藏匿手法可选项：内置分化子集（req 门控）+ approved 自定义技能；由 world 单一助手生成 */
const stashOptions = computed(() => availableStashes(world, seed));
/** 传递通道可选项：内置通道 + approved 自定义技能 */
const channelOptions = computed(() => [...DELIVERY_CHANNELS, ...approvedUgc.value.map((s) => skillToChannel(s))]);
/** 当前生效的藏匿手法（跳过置灰项） / 传递通道（未选回退首项） */
const selMethod = computed(
    () => stashOptions.value.find((m) => m.id === form.value.methodId && !m.locked) || stashOptions.value.find((m) => !m.locked) || stashOptions.value[0]
);
const selChannel = computed(() => channelOptions.value.find((c) => c.id === form.value.channelId) || channelOptions.value[0]);
function onOpCardTap(it: { k: string; sel?: boolean }) {
    if (!it.sel) return;
    if (opTab.value === '藏') {
        const m = stashOptions.value.find((x) => x.id === it.k);
        if (m && m.locked) {
            sceneRef.value?.flash((m.reqLabel || '需道具') + '，去「人物故事会」领取');
            return;
        }
        form.value.methodId = it.k;
    } else if (opTab.value === '传') {
        form.value.channelId = it.k;
    }
}
/** 投放表单选择藏匿手法（置灰项拦截并引导） */
function pickMethod(m: any) {
    if (m.locked) {
        sceneRef.value?.flash((m.reqLabel || '需道具') + '，去「人物故事会」领取');
        return;
    }
    form.value.methodId = m.id;
}
const isOpSelected = (it: { k: string; sel?: boolean }) =>
    !!it.sel && (opTab.value === '藏' ? selMethod.value.id === it.k : opTab.value === '传' ? selChannel.value.id === it.k : false);
const opItems = computed(() => {
    if (opTab.value === '藏')
        return stashOptions.value.map((s) => {
            const eff = effectiveStash(world, s);
            return {
                k: s.id,
                t: (s.locked ? '🔒 ' : '') + s.name,
                d: s.locked ? s.reqLabel || '需道具' : isUgc(s.id) ? '自定义技能·已入库' : '无门槛',
                tag: `隐蔽${eff.conceal}·取用${eff.speed}·风险${eff.risk}` + (s.combo ? ' ·组合:' + s.combo : ''),
                sel: true,
                locked: s.locked
            };
        });
    if (opTab.value === '传')
        return channelOptions.value.map((c) => ({
            k: c.id,
            t: c.name,
            d: c.type === 'realtime' ? '实时·需同窗协作' : '异步·可离线推进',
            tag: '风险' + c.risk + (isUgc(c.id) ? ' ·自定义' : ''),
            sel: true
        }));
    if (opTab.value === '道具')
        return PROPS.map((pr) => ({ k: pr.id, t: pr.name, d: pr.effect, tag: hasProp(world, pr.id) ? '已持有' : '人物故事会' }));
    return SKILL_CATEGORIES.flatMap((cat) =>
        cat.examples.map((ex, i) => ({ k: cat.id + i, t: ex, d: '', tag: cat.name }))
    );
});

/* ── UGC 自定义技能审核闭环（数据源：store；审核在运营后台，玩家只读状态） ── */
/** 我的提交（任意状态）；approved 全量另见 approvedUgc 供选择器融合 */
const mySkills = computed(() => jh.customSkills.filter((s) => (s.customerId || '') === (jh.profile?.customerId || '')));
const ugc = ref<{ cat: string; name: string; desc: string }>({ cat: 'item', name: '', desc: '' });
async function submitUgc() {
    if (!ugc.value.name.trim()) {
        uni.showToast({ title: '请填写技能名', icon: 'none' });
        return;
    }
    try {
        await jh.submitCustomSkill({ name: ugc.value.name.trim(), category: ugc.value.cat as any, desc: ugc.value.desc.trim() });
        ugc.value = { cat: 'item', name: '', desc: '' };
        uni.showToast({ title: '已提交，待运营审核', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '提交失败').slice(0, 30), icon: 'none' });
    }
}
/** 演练技能：approved 生效；rejected 触发失败 + 伪造证据反噬（暴露度飙升）；pending 审核中 */
function useSkill(id: string) {
    const s = jh.customSkills.find((x) => x.id === id);
    if (!s) return;
    if (s.status === 'pending') {
        sceneRef.value?.flash('技能仍在人工审核中');
        return;
    }
    if (s.status === 'rejected') {
        addEvidence(world, 'forgery', 'rejected-' + id, 4);
        sceneRef.value?.flash('演练失败：伪造证据反噬，暴露度飙升');
        return;
    }
    sceneRef.value?.flash('技能生效：' + s.name);
}

/* ── 场景世界：实例化对象 + 状态机 + 时钟恢复（渲染无关） ── */
const seed = deriveSeed(jh.profile?.id || 'guest');
/** 暗号可选列表：语境暗号（书架编号/画中题诗/借阅卡，按种子分化）+ 经典切口 */
const codeList = computed(() => [...contextualBoard(seed), ...CODEBOOK]);

/* ── 识别系统：线索碎片 → 拼合候选暗号（P0） ── */
/** 道具减免：显影剂 / 解码镜降低一档来源门槛；录音耳语抵一类来源 */
const decodeAid = computed(() => hasProp(world, 'developer') || hasProp(world, 'decode-glass'));
const recordedAid = computed(() => recorderNotes.value.length > 0);
const clueOpts = computed(() => ({ decode: decodeAid.value, recorded: recordedAid.value }));
const clueItems = computed(() =>
    jh.clues.map((c) => {
        const meta = CLUE_SOURCES.find((s) => s.id === c.source);
        return { source: c.source, name: meta ? meta.name : c.source, text: c.text, where: c.where };
    })
);
/** 当前线索可拼合出的候选暗号 key 集合 */
const candidateKeys = computed(() => new Set(assembleClues(jh.clues, seed, clueOpts.value)));
const isCandidate = (k: string) => candidateKeys.value.has(k);
const candidateCount = computed(() => candidateKeys.value.size);
const clueGuide = computed(() => {
    if (!drop.value) return '先投放情报，上线才能凭线索拼暗号。';
    if (decodeAid.value) return '持有显影剂/解码镜：来源门槛 −1（仍需至少一类线索）。';
    if (recordedAid.value) return '录得耳语：可抵一类线索来源。';
    return '取到线索的来源数达标后，对应暗号会亮金标。';
});
async function collectClue(source: ClueSource) {
    try {
        const f = await jh.collectClueFragment(source, seed);
        sceneRef.value?.flash('取得线索（' + f.where + '）：' + f.text);
        uni.showToast({ title: '线索：' + f.text, icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '取线索失败').slice(0, 30), icon: 'none' });
    }
}
const world = reactive(createLibraryWorld(0, seed)) as SceneWorld;
/** 情报主题（纯 UI 用途，不进场景模型） */
const topicHint = ref('');
/** 当前玩家可见藏点子集（playerId 分化，不重样） */
const myStashes = computed(() => activeStashes(seed));
/** 持有道具（驱动门控/组合/效果） */
const ownedProps = computed(() => PROPS.filter((pr) => hasProp(world, pr.id)));

const MARK_DIR: Record<DeadDropMarker, [number, number]> = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
function nextOrient(o: DeadDropMarker): DeadDropMarker {
    return o === 'E' ? 'S' : o === 'S' ? 'W' : o === 'W' ? 'N' : 'E';
}
function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
}

/* ── Phaser 场景 ── */
/** 闭馆管理员巡查周期（场景时钟）：8 分钟一轮，其中 90 秒在巡 */
const ADMIN_CYCLE_MS = 8 * 60_000;
const ADMIN_ACTIVE_MS = 90_000;
const gameContainer = ref<HTMLElement | null>(null);
const sceneRef = shallowRef<any>(null);
let game: any = null;

/**
 * 2D 横版场景工厂（学校图书馆 · 密页传递）
 *
 * 原等距 2.5D 场景（IsoGrid + 工具切换式拖拽）已整体替换为 2D 横版点击解谜：
 * 布局 / 深度 / 直接抓取 / 书籍与桌子状态机 / 风险联动全部在 scene2d/ 中实现，
 * 本页只负责把 Phaser 实例交给它，玩法闭环与后端契约不变。
 */
function makeLibraryScene(Phaser: any) {
    return makeLibrary2dScene(Phaser);
}

/* ── 生命周期 ── */
let timer: any = 0;
onShow(async () => {
    await jh.loadDeadDrop();
    await jh.loadCustomSkills();
    await jh.loadInventory();
    if (drop.value && drop.value.phase !== 'IDLE') {
        topicHint.value = (drop.value as any).topic || '';
        placeMarker(world, 3, 3, drop.value.marker);
    }
    timer = setInterval(() => jh.loadDeadDrop().catch(() => {}), 1000);
});
onHide(() => clearInterval(timer));

onMounted(() => {
    (async () => {
        const Phaser = (await import('phaser')).default;
        const hasArt = await probeArt();
        const LibraryScene = makeLibraryScene(Phaser);
        const host: any =
            (gameContainer.value as any)?.$el ?? gameContainer.value ?? (typeof document !== 'undefined' ? document.querySelector('.stage') : null);
        if (!host) {
            uni.showToast({ title: '场景容器未就绪', icon: 'none' });
            return;
        }
        const hooks = {
            onObjectTap: (zone: string, gx: number, gy: number) => openForm(zone, gx, gy),
            /** 「物·用」工具：点场景物体 → 角色走到该处 → 取用对应道具 */
            onUsePropAt: (propId: string, gx: number, gy: number) => usePropAt(propId, gx, gy),
            /** 「取·收」工具：点格子 → 命中暗点则开信，点错留脚步声 */
            onPickAt: (x: number, y: number) => pickAt(x, y),
            /** 巡逻 AI 读取当前暗点（阶段/坐标/隐蔽度） */
            getDrop: () => drop.value,
            /** 闭馆管理员截获（重罚） */
            onAdminSeize: () => adminSeize(),
            /** 巡逻状态机状态变化 → HUD */
            onPatrolState: (text: string, riskPct: number) => {
                patrolStateText.value = text;
                patrolRiskPct.value = riskPct;
            },
            onGroundTap: (gx: number, gy: number) => onTapGround(gx, gy),
            onSceneReady: (sc: any) => {
                sceneRef.value = sc;
                (window as any).__jhScene = sc; // 场景实例暴露给调试 / Playwright 断言
                (window as any).__openPuzzle = (k: any) => openPuzzle(k); // 供走查脚本打开解谜弹窗截留动效
                startSceneTick();
                sc.setPhase(phase.value);
                sc.setDifficulty(difficulty.value);
                if (!guideDone.value) {
                    guideDone.value = true;
                    setTimeout(() => sc.flash('① 选「藏·投」点画面，挑手法投放情报'), 500);
                    setTimeout(() => sc.flash('② 到可取窗，用「取·收」走到暗点点开信函、报暗号取件'), 2400);
                    setTimeout(() => sc.flash('③ 证据越少巡逻越慢；善后清理痕迹，否则下一局更难'), 4300);
                }
            },
            openForm: (cavity: string) => openForm(cavity),
            onPatrolSeize: (reason?: string) => patrolSeizeNow(reason || '巡逻员识破暗点，取走密页'),
            onStoryTap: () => (storyOpen.value = true),
            /** 短按大阅览桌 → 弹出翻面 / 桌底动作条 */
            onTableTap: (id: string, flipped: boolean) => onTableTap(id, flipped),
            /** 翻面动画结束 → 校正动作条状态 */
            onTableChanged: (id: string, flipped: boolean) => onTableChanged(id, flipped),
            /** 场景异常（书开着 / 桌翻着 / 书掉地上）→ HUD 提示 */
            onAnomaly: (kind: string, label: string) => {
                anomalyHint.value = label + '（暴露度上升）';
            }
        };
        game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: host,
            // 2D 横版：逻辑分辨率 480×640，世界宽 720 由场景内相机横向滚动
            width: 480,
            height: 640,
            backgroundColor: '#0c1118',
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            // 交互保障：多点触控 + 关闭右键菜单，避免拖拽被浏览器手势吞掉
            input: { activePointers: 2, touch: { capture: true } },
            disableContextMenu: true,
            scene: [LibraryScene],
            callbacks: {
                preBoot: (g: any) => {
                    g.registry.set('world', world);
                    g.registry.set('art', hasArt);
                    g.registry.set('hooks', hooks);
                    g.registry.set('tool', tool.value);
                }
            }
        });
        // 画布就绪后补齐触控样式：保证移动端拖拽 / 点击不被浏览器手势吞掉
        const styleCanvas = () => {
            try {
                const cv = host.querySelector && host.querySelector('canvas');
                if (!cv) return false;
                cv.style.display = 'block';
                cv.style.touchAction = 'none';
                cv.style.userSelect = 'none';
                cv.style.outline = 'none';
                return true;
            } catch {
                return false;
            }
        };
        if (game && game.events) game.events.once('ready', () => { styleCanvas(); if (game.scale) game.scale.refresh(); });
        const styleTimer = setInterval(() => {
            if (styleCanvas()) clearInterval(styleTimer);
        }, 400);
        setTimeout(() => clearInterval(styleTimer), 8000);
    })();
});

onUnmounted(() => {
    clearInterval(timer);
    clearCountdowns();
    stopSceneTick();
    if (game) {
        game.destroy(true);
        game = null;
    }
});

/* ── 与场景交互的回调 ── */
function onTapGround(gx: number, gy: number) {
    const m = world.objects.marker;
    if (m.state !== 'placed') placeMarker(world, gx, gy, 'E');
    else if (m.data.gx === gx && m.data.gy === gy) m.data.orient = nextOrient(m.data.orient);
    else placeMarker(world, gx, gy, m.data.orient);
    form.value.marker = m.data.orient;
    sceneRef.value?.flash('便签已摆放，朝向：' + ({ E: '东', S: '南', W: '西', N: '北' }[m.data.orient]));
}

watch(tool, (t) => {
    if (game) game.registry.set('tool', t);
});
// 阶段/持有态变化后，若当前工具被禁用则自动退回「手」
watch(toolEnabled, (en) => {
    if (!(en as Record<string, boolean>)[tool.value]) tool.value = 'hand';
});
watch(phase, (p) => {
    sceneRef.value?.setPhase(p);
});
// 已入库自定义技能镜像进 world.skills（供 availableStashes 合并 UGC 藏点/门控/组合）
watch(
    () => jh.customSkills,
    (list) => {
        const m: Record<string, any> = {};
        list.forEach((s) => (m[s.id] = s));
        world.skills = m as any;
    },
    { immediate: true }
);
// 持有道具：store 为持久化源，镜像进 world.inventory 供门控 / 组合 / 效果读取
watch(
    () => jh.inventory,
    (v) => {
        world.inventory.splice(0, world.inventory.length, ...(v || []));
    },
    { immediate: true }
);

function callScene(method: string, ...args: any[]) {
    const sc = sceneRef.value;
    if (sc && typeof sc[method] === 'function') sc[method](...args);
    else uni.showToast({ title: '场景尚未就绪', icon: 'none' });
}
</script>

<style scoped lang="scss">
/* 水墨江湖 · 密页传递
   版式：单列卡片流，内容列固定 480px 居中 —— 桌面端与移动端像素级一致；
   单位统一用 px（不随窗体宽度缩放），仅舞台宽度自适应、由 Phaser FIT 等比缩放。 */
$ink: #0b0e14;
$gold: #c8a24a;
$paper: #f3e9cf;
$muted: #9c8c74;
$red: #9e2b25;
$green: #1f6f5c;

.dd {
    box-sizing: border-box;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    padding: 14px 14px 28px;
    overflow-x: hidden;
    background: linear-gradient(180deg, #101722 0%, $ink 100%);
    color: $paper;
    font-size: 13px;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* ── 顶栏 ── */
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(200, 162, 74, 0.16), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(200, 162, 74, 0.32);
}
.tb-l {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.title {
    color: $paper;
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.5px;
}
.sub {
    margin-top: 3px;
    color: $muted;
    font-size: 11px;
}
.seal {
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: 10px;
    background: linear-gradient(160deg, $red, #6f1d19);
    color: #ffeccf;
    font-size: 15px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 236, 207, 0.35);
}

/* ── 张力条 ── */
.tension {
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.ten-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.ten-l {
    flex: none;
    width: 44px;
    color: $muted;
    font-size: 11px;
}
.ten-bar {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
}
.ten-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.35s ease;
}
.ten-v {
    flex: none;
    min-width: 76px;
    text-align: right;
    color: $paper;
    font-size: 11px;
    font-weight: 700;
}
.ten-win {
    flex: 1;
    color: $muted;
    font-size: 11px;
}
.ten-win.warn {
    color: $gold;
    font-weight: 700;
}

/* ── 场景舞台 ── */
.scene-wrap {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: #0c1118;
    border: 1px solid rgba(200, 162, 74, 0.26);
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
}
.scene-wrap.shake {
    animation: shakeX 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes shakeX {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-7px); }
    40%, 60% { transform: translateX(7px); }
}
.spotted-flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    background: radial-gradient(circle at 50% 45%, rgba(255, 60, 60, 0) 30%, rgba(255, 40, 40, 0.55) 100%);
    animation: spottedPulse 0.5s ease-out;
}
@keyframes spottedPulse {
    0% { opacity: 0; }
    30% { opacity: 1; }
    100% { opacity: 0; }
}
.stage {
    width: 360px;
    max-width: 100%;
    height: 560px;
    margin: 0 auto;
    background: #0c1118;
    /* 舞台内一律交给 Phaser 处理手势：禁止浏览器平移/缩放，保证拖拽与点击生效 */
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    :deep(canvas) {
        display: block;
        touch-action: none;
        outline: none;
    }
}
.scene-bar {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    gap: 6px;
}
.sb-btn {
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 11px;
    color: #ffeccf;
    background: rgba(12, 17, 24, 0.72);
    border: 1px solid rgba(200, 162, 74, 0.4);
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}

/* ── 工具盘 ── */
.tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
}
.tool {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 2px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.2s ease, transform 0.12s ease;
    &:active {
        transform: scale(0.96);
    }
}
.t-ic {
    font-size: 18px;
    line-height: 1.1;
}
.t-tx {
    font-size: 11px;
    color: $muted;
    white-space: nowrap;
}
.tool.on {
    background: linear-gradient(160deg, rgba(200, 162, 74, 0.9), rgba(158, 43, 37, 0.85));
    border-color: $gold;
    .t-tx {
        color: #1a1208;
        font-weight: 800;
    }
}
.tool-hint {
    padding: 9px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid rgba(200, 162, 74, 0.6);
    color: $muted;
    font-size: 11px;
}

/* ── 桌子动作条（2D：短按大阅览桌弹出） ── */
.table-act {
    margin-top: 10px;
    padding: 12px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(200, 162, 74, 0.12), rgba(12, 17, 24, 0.72));
    border: 1px solid rgba(200, 162, 74, 0.45);
}
.ta-t {
    display: block;
    color: $gold;
    font-size: 13px;
    font-weight: 600;
}
.ta-d {
    display: block;
    margin-top: 4px;
    color: $muted;
    font-size: 11px;
    line-height: 1.5;
}
.ta-btns {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}
.ta-btns .btn {
    flex: 1;
}

/* ── 生效中的道具效果 ── */
.fx {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.fx-item {
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    color: #0f151d;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    font-weight: 700;
}

/* ── 新手引导 ── */
.onboard {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(200, 162, 74, 0.12);
    border: 1px dashed rgba(200, 162, 74, 0.45);
}
.ob-t {
    flex: 1;
    color: $paper;
    font-size: 12px;
}
.ob-x {
    flex: none;
    color: $gold;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

/* ── 操作手册 ── */
.ops {
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
}
.ops-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}
.ops-t {
    color: $paper;
    font-size: 13px;
    font-weight: 800;
}
.ops-arr {
    color: $gold;
    font-size: 11px;
}
.ops-body {
    padding: 0 12px 12px;
}
.ops-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 10px;
}
.ops-tab {
    text-align: center;
    padding: 7px 0;
    border-radius: 999px;
    font-size: 12px;
    color: $muted;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}
.ops-tab.on {
    color: #1a1208;
    font-weight: 800;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    border-color: $gold;
}
.ops-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.ops-card {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.09);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        background: rgba(200, 162, 74, 0.12);
    }
}
.ops-card-t {
    color: $paper;
    font-size: 13px;
    font-weight: 700;
}
.ops-sel {
    margin-left: 6px;
    color: $gold;
    font-size: 11px;
}
.ops-card-d {
    margin-top: 2px;
    color: $muted;
    font-size: 11px;
}
.ops-tag {
    margin-top: 4px;
    color: #b9a98f;
    font-size: 11px;
}

/* ── UGC 自定义技能 ── */
.ugc {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed rgba(255, 255, 255, 0.12);
}
.ugc-t {
    color: $muted;
    font-size: 11px;
}
.ugc-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
}
.ugc-cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.ugc-cat {
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    color: $muted;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
}
.ugc-cat.on {
    color: #1a1208;
    font-weight: 700;
    background: #e8c9a0;
    border-color: $gold;
}
.inp,
.area {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 10px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: $paper;
    font-size: 12px;
}
.area {
    min-height: 74px;
}
.ugc-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
}
.ugc-item {
    padding: 9px 11px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.ugc-item-t {
    color: $paper;
    font-size: 12px;
    font-weight: 700;
}
.ugc-badge {
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.1);
    color: $muted;
}
.ugc-badge.pending {
    color: #0f151d;
    background: #e8c9a0;
}
.ugc-badge.approved {
    color: #eafff7;
    background: $green;
}
.ugc-badge.rejected {
    color: #ffeccf;
    background: $red;
}
.ugc-item-d {
    margin-top: 3px;
    color: $muted;
    font-size: 11px;
}
.ugc-item-btns {
    margin-top: 6px;
}
.ubtn {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11px;
    color: #1a1208;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    font-weight: 700;
    cursor: pointer;
}
.ubtn.wait {
    color: $muted;
    background: rgba(255, 255, 255, 0.06);
    font-weight: 400;
}
.ugc-none {
    color: $muted;
    font-size: 11px;
}

/* ── 背包 ── */
.bag {
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
}
.bag-btn {
    padding: 12px 14px;
    color: $paper;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}
.bag-panel {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.bag-item {
    padding: 9px 11px;
    border-radius: 10px;
    font-size: 12px;
    color: $paper;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        background: rgba(200, 162, 74, 0.16);
    }
}
.bag-h {
    margin-top: 4px;
    color: $gold;
    font-size: 11px;
    font-weight: 700;
}
.bag-props {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}
.bag-prop {
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(200, 162, 74, 0.08);
    border: 1px solid rgba(200, 162, 74, 0.28);
}
.bag-prop.off {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.08);
    opacity: 0.66;
}
.bp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}
.bp-t {
    color: $paper;
    font-size: 12px;
    font-weight: 700;
}
.bp-use {
    flex: none;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: #1a1208;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        transform: scale(0.94);
    }
}
.bp-use.off {
    color: $muted;
    background: rgba(255, 255, 255, 0.08);
    font-weight: 400;
}
.bp-d {
    margin-top: 4px;
    color: $muted;
    font-size: 11px;
}
.bag-n {
    color: $muted;
    font-size: 11px;
}

/* ── 场景对象演示 ── */
.demo {
    padding: 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.demo-t {
    color: $gold;
    font-size: 12px;
    font-weight: 700;
}
.demo-btns {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 8px;
}
.dbtn {
    text-align: center;
    padding: 9px 6px;
    border-radius: 10px;
    font-size: 12px;
    color: $paper;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        background: rgba(200, 162, 74, 0.16);
    }
}
.dbtn.warn {
    color: #ffeccf;
    background: rgba(158, 43, 37, 0.28);
    border-color: rgba(158, 43, 37, 0.6);
}
.dbtn.ghost {
    color: $muted;
}
.demo-n {
    display: block;
    margin-top: 8px;
    color: $muted;
    font-size: 11px;
}

/* ── 身份条 ── */
.ribbon {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(200, 162, 74, 0.1);
    border: 1px solid rgba(200, 162, 74, 0.28);
    font-size: 11px;
    color: #e8dcc0;
}
.r-mid {
    color: $muted;
}
.r-r {
    color: $gold;
    font-weight: 700;
}

/* ── 阶段面板 ── */
.panel {
    padding: 14px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.panel.seized {
    border-color: rgba(158, 43, 37, 0.6);
    background: rgba(158, 43, 37, 0.12);
}
.p-t {
    color: $muted;
    font-size: 12px;
}
.info {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.info-t {
    color: $paper;
    font-size: 14px;
    font-weight: 800;
}
.info-t.bad {
    color: #ff8b84;
}
.info-r {
    color: #cbbfa4;
    font-size: 12px;
}
.code-box {
    padding: 11px 12px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.24);
    border: 1px solid rgba(200, 162, 74, 0.28);
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.c-t {
    color: $gold;
    font-size: 12px;
    font-weight: 700;
}
.c-hint,
.c-tries {
    color: $muted;
    font-size: 11px;
}
.c-hidden,
.c-reveal {
    color: #7fe0c0;
    font-size: 11px;
}
.c-reveal {
    font-weight: 700;
}
.cipher {
    padding: 11px 12px;
    border-radius: 12px;
    background: rgba(31, 111, 92, 0.14);
    border: 1px solid rgba(31, 111, 92, 0.4);
}
.c-h {
    color: #7fe0c0;
    font-size: 11px;
    font-weight: 700;
}
.c-b {
    margin-top: 4px;
    color: $paper;
    font-size: 12px;
}
.hint {
    color: $muted;
    font-size: 11px;
}

/* ── 选择芯片 ── */
.marks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.marks.wrap {
    gap: 6px;
}
.mark {
    padding: 6px 11px;
    border-radius: 999px;
    font-size: 12px;
    color: #cbbfa4;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        transform: scale(0.96);
    }
}
.mark.on {
    color: #1a1208;
    font-weight: 700;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    border-color: $gold;
}
.mark.locked {
    color: $muted;
    border-style: dashed;
    opacity: 0.7;
}
/* 线索可拼合的候选暗号：金色描边（选中仍走 .mark.on） */
.mark.cand:not(.on) {
    color: $gold;
    border-color: rgba(200, 162, 74, 0.65);
    background: rgba(200, 162, 74, 0.12);
}

/* ── 识别系统：线索拼合 ── */.clue {
    margin-top: 12px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.clue-btns {
    display: flex;
    gap: 6px;
    margin: 8px 0;
}
.cbtn {
    flex: 1;
    padding: 7px 0;
    text-align: center;
    font-size: 12px;
    color: #e8d9b5;
    background: rgba(31, 111, 92, 0.22);
    border: 1px solid rgba(31, 111, 92, 0.5);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &:active {
        transform: scale(0.96);
    }
}
.clue-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.clue-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 9px;
    border-radius: 8px;
    background: rgba(200, 162, 74, 0.1);
    border: 1px dashed rgba(200, 162, 74, 0.4);
}
.ci-s {
    flex: none;
    font-size: 11px;
    color: $gold;
}
.ci-t {
    flex: none;
    font-size: 14px;
    font-weight: 700;
    color: $paper;
}
.ci-w {
    font-size: 10px;
    color: $muted;
}

/* ── 截获复盘 ── */
.review {
    margin-top: 10px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 77, 79, 0.08);
    border: 1px dashed rgba(255, 77, 79, 0.45);
}
.rv-t {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #ff8f8f;
    margin-bottom: 4px;
}
.rv-i {
    display: block;
    font-size: 11px;
    line-height: 1.7;
    color: #e8d5c0;
}

/* ── 按钮 ── */
.btn {
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 11px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
    color: $paper;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    &::after {
        border: none;
    }
}
.btn.primary {
    color: #1a1208;
    font-weight: 800;
    background: linear-gradient(120deg, #e8c9a0, $gold);
    border-color: $gold;
}
.btn.ghost {
    color: $muted;
}
.btn.sm {
    width: auto;
    padding: 6px 14px;
    font-size: 12px;
}

/* ── 弹层 ── */
.sheet {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: rgba(6, 9, 13, 0.74);
}
.sheet-card {
    width: 100%;
    max-width: 440px;
    max-height: 86vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    box-sizing: border-box;
    border-radius: 16px;
    background: linear-gradient(180deg, #17202b, #101620);
    border: 1px solid rgba(200, 162, 74, 0.38);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
}
.sheet-card.flash {
    animation: cardFlash 0.5s ease-out;
}
@keyframes cardFlash {
    0% { border-color: rgba(127, 214, 160, 0.9); box-shadow: 0 0 0 0 rgba(127, 214, 160, 0.5), 0 18px 40px rgba(0, 0, 0, 0.55); }
    45% { border-color: rgba(127, 214, 160, 1); box-shadow: 0 0 0 6px rgba(127, 214, 160, 0.32), 0 18px 40px rgba(0, 0, 0, 0.55); }
    100% { border-color: rgba(200, 162, 74, 0.38); box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55); }
}
.s-t {
    color: $paper;
    font-size: 16px;
    font-weight: 800;
}
.s-l {
    color: $muted;
    font-size: 11px;
}
.s-dim {
    color: rgba(243, 233, 207, 0.45);
}
.s-l.combo {
    color: #7fe0c0;
}
.sheet-btns {
    display: flex;
    gap: 10px;
    .btn {
        flex: 1;
    }
}
.story-npc {
    padding: 9px 11px;
    border-radius: 12px;
    background: rgba(200, 162, 74, 0.1);
    border-left: 3px solid $gold;
    color: #e8dcc0;
    font-size: 12px;
}
.story-offers {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.story-offer {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.story-offer.owned {
    border-color: rgba(31, 111, 92, 0.5);
    background: rgba(31, 111, 92, 0.12);
}
.so-t {
    color: $paper;
    font-size: 13px;
    font-weight: 700;
}
.so-need {
    margin-left: 8px;
    color: $gold;
    font-size: 11px;
    font-weight: 400;
}
.so-d {
    color: $muted;
    font-size: 11px;
}
.story-offer .btn.sm {
    align-self: flex-start;
}

/* ── 本轮增强：警觉条 ── */
.alert-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 12px 0;
    padding: 6px 10px;
    border-radius: 12px;
    background: rgba(12, 10, 8, 0.7);
    border: 1px solid rgba(200, 162, 74, 0.28);
}
.alert-ic {
    font-size: 15px;
    filter: grayscale(1);
    opacity: 0.5;
}
.alert-ic.on {
    filter: none;
    opacity: 1;
    animation: blink 1s infinite;
}
@keyframes blink {
    50% {
        opacity: 0.4;
    }
}
.alert-bar {
    flex: 1;
    height: 7px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
}
.alert-fill {
    height: 100%;
    border-radius: 5px;
    background: linear-gradient(90deg, #1f6f5c, #c8a24a);
    transition: width 0.15s linear;
}
.alert-fill.mid {
    background: linear-gradient(90deg, #c8a24a, #ffd166);
}
.alert-fill.hot {
    background: linear-gradient(90deg, #c8a24a, #ff4d4f);
    animation: alertPulse 0.7s ease-in-out infinite;
}
@keyframes alertPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.4); }
}
.alert-tx {
    font-size: 11px;
    color: #9fb6ff;
    min-width: 72px;
    text-align: right;
}
.alert-tx.warn {
    color: #ff8c7a;
    font-weight: 700;
}

/* ── 本轮增强：环境/策略控制条 ── */
.scene-ctrls {
    display: flex;
    gap: 8px;
    margin: 8px 12px 0;
    flex-wrap: wrap;
}
.scb {
    flex: 1;
    min-width: 72px;
    text-align: center;
    padding: 8px 6px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cdbfa6;
    font-size: 12px;
    cursor: pointer;
}
.scb.on {
    background: rgba(200, 162, 74, 0.16);
    border-color: #c8a24a;
    color: #f0e2bf;
}
.scb:active {
    transform: scale(0.97);
}
.scb.locked {
    opacity: 0.5;
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.18);
    color: #8a8071;
}
.scb.locked.on {
    background: rgba(200, 162, 74, 0.16);
    border-color: #c8a24a;
    color: #f0e2bf;
}
.scb.shake {
    animation: shakeX 0.4s;
    border-color: #ff6b6b !important;
    color: #ffb3b3 !important;
}
.uv-bubble {
    flex-basis: 100%;
    order: 9;
    margin-top: 2px;
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(40, 16, 16, 0.95);
    border: 1px solid rgba(255, 107, 107, 0.5);
    color: #ffb3b3;
    font-size: 11px;
    line-height: 1.4;
    max-width: 240px;
}

/* ── 本轮增强：线索链（依赖图）面板 ── */
.clue-chain {
    margin: 8px 12px 0;
    padding: 10px 12px;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(28, 22, 16, 0.92), rgba(18, 14, 10, 0.92));
    border: 1px solid rgba(200, 162, 74, 0.28);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.cc-title {
    font-size: 12px;
    color: #c8a24a;
    letter-spacing: 2px;
    margin-bottom: 8px;
}
.cc-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
}
.cc-row:first-of-type {
    border-top: none;
}
.cc-ic {
    font-size: 13px;
    width: 18px;
    text-align: center;
    margin-top: 1px;
    opacity: 0.6;
}
.cc-row.got .cc-ic {
    color: #7fd6a0;
    opacity: 1;
}
.cc-body {
    display: flex;
    flex-direction: column;
    flex: 1;
}
.cc-label {
    font-size: 13px;
    color: #d8cbb0;
}
.cc-row.got .cc-label {
    color: #f0e2bf;
}
.cc-hint {
    font-size: 11px;
    color: #8a8071;
    margin-top: 2px;
    line-height: 1.4;
}
.cc-hint.got {
    color: #7fd6a0;
}
.cc-row.just {
    animation: ccFlash 1.2s ease-out;
}
@keyframes ccFlash {
    0% { background: rgba(127, 214, 160, 0.28); border-radius: 10px; }
    100% { background: transparent; }
}

/* ── 本轮增强：解谜弹窗 / 评分浮层 ── */
.sheet-card.puzzle,
.sheet-card.score {
    max-width: 320px;
}
.sc-t {
    color: #f0e2bf;
    font-size: 16px;
    font-weight: 700;
}
.sc-hint {
    color: #9b8f7c;
    font-size: 12px;
    line-height: 1.5;
}
.pz-msg {
    color: #ff8c7a;
    font-size: 12px;
}
.score-seal {
    align-self: center;
    margin: 8px 0;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 800;
    color: #1a1410;
    background: radial-gradient(circle at 35% 30%, #e8d9a0, #c8a24a);
    box-shadow: 0 0 0 4px rgba(200, 162, 74, 0.25), inset 0 0 14px rgba(0, 0, 0, 0.25);
}
.score-seal.ghost {
    background: radial-gradient(circle at 35% 30%, #f6f1e7, #b9b1a4);
    color: #3a2f25;
}
.score-rows {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0;
}
.sr {
    display: flex;
    justify-content: space-between;
    color: #cdbfa6;
    font-size: 13px;
}
.sr .sv {
    color: #f0e2bf;
    font-weight: 700;
}
.sr .sv.warn {
    color: #ff8c7a;
}

/* ── 页脚 ── */
.foot {
    padding: 10px 12px 4px;
    color: #6f6559;
    font-size: 11px;
    text-align: center;
}
</style>
