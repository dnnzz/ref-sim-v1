# Ball State Management - Sprint 1 / Gün 1

**Single Source of Truth** için top state'i refactor edildi.

## ✅ Ne Değişti?

### 1. **Tek Otorite: `ball.ballState`**
```javascript
ball.ballState = {
  pos: Vector2,  // Topun gerçek pozisyonu
  vel: Vector2   // Topun gerçek hızı
}
```

- **ball.x/y**: Sadece render için kullanılıyor (read-only)
- **ballState.pos**: Fizik hesaplamalarında tek kaynak

### 2. **Centralized Helper Fonksiyonlar**

#### `ensureBallState(ball)`
```javascript
// Ball state'in var olduğundan emin ol
const bs = this.ensureBallState(this.ball);
```

#### `setBallMode(mode, opts)`
```javascript
// CARRIED mode
this.setBallMode('CARRIED', { carrier: this.attacker });

// SHOT mode
this.setBallMode('SHOT', { 
  shotTarget: new Phaser.Math.Vector2(tx, ty),
  shotSpeed: RULES.shotSpeed 
});

// REBOUND mode
this.setBallMode('REBOUND', { 
  reboundVel: new Phaser.Math.Vector2(vx, vy) 
});
```

#### `setPossession(who, opts)`
```javascript
// Auto-carried: possession değişince mode da CARRIED olur
this.setPossession('attacker', { carrier: this.attacker });

// Manual: sadece possession değişir
this.setPossession('loose', { autoCarried: false });
```

### 3. **Update Loop Routing**

```javascript
updateBall(time, dt) {
  switch (this.play.ballMode) {
    case 'CARRIED': this.updateCarriedBall(time, dt); break;
    case 'SHOT': this.updateShotBall(time, dt); break;
    case 'REBOUND': this.updateLooseBall(time, dt); break;
  }
  
  // CRITICAL: Render sync (tek yerde!)
  this.ball.x = bs.pos.x;
  this.ball.y = bs.pos.y;
  this.ballOutline.x = bs.pos.x;
  this.ballOutline.y = bs.pos.y;
}
```

#### **updateCarriedBall(time, dt)**
- Auto turnover logic
- Carrier belirleme
- `updateDribble()` çağrısı (ballState'i günceller)

#### **updateShotBall(time, dt)**
- Linear motion: `bs.pos += bs.vel * dt`
- Trail effect

#### **updateLooseBall(time, dt)**
- Friction: `bs.vel.scale(friction)`
- Bounds collision + bounce
- Auto-pickup check
- Timed rebound end

### 4. **Auto-Pickup System**

```javascript
checkBallPickup(time) {
  // Conditions:
  // 1. distance < RULES.ballPickupDist (18px)
  // 2. relativeSpeed < RULES.ballPickupRelSpeed (80)
  
  // Then: setPossession(who, { carrier })
}
```

---

## 🚨 En Sık Yapılan Hatalar

### ❌ HATA 1: ballState sync unutma
```javascript
// YANLIŞ:
this.play.ballMode = 'SHOT';
this.play.ballVel.set(vx, vy);
// ballState sync yok!

// DOĞRU:
this.setBallMode('SHOT', { 
  shotTarget: new Phaser.Math.Vector2(tx, ty) 
});
```

### ❌ HATA 2: Render sync'te çift yazım
```javascript
// YANLIŞ:
this.ball.x = this.attacker.pos.x;
this.ball.y = this.attacker.pos.y;
// render sync zaten updateBall() sonunda yapılıyor!

// DOĞRU:
// Render sync'i updateBall() içinde otomatik yapılır
// Sen sadece bs.pos'u güncelle
```

### ❌ HATA 3: Mode değişince vel sıfırlamama
```javascript
// YANLIŞ:
this.play.ballMode = 'CARRIED';
// vel hala eski SHOT velocity'sinde!

// DOĞRU:
this.setBallMode('CARRIED', { carrier });
// vel otomatik sıfırlanır
```

### ❌ HATA 4: ball.x/y direkt set etme
```javascript
// YANLIŞ (Physics update içinde):
this.ball.x += vx * dt;
this.ball.y += vy * dt;

// DOĞRU:
const bs = this.ball.ballState;
bs.pos.x += bs.vel.x * dt;
bs.pos.y += bs.vel.y * dt;
// render sync updateBall() sonunda otomatik
```

### ❌ HATA 5: Possession değişiminde carrier belirtmeme
```javascript
// YANLIŞ:
this.play.possession = 'attacker';
this.play.ballMode = 'CARRIED';
// top kimin elinde?

// DOĞRU:
this.setPossession('attacker', { carrier: this.attacker });
// mode + carrier otomatik ayarlanır
```

### ❌ HATA 6: Mode switch'te pozisyon senkronizasyonu
```javascript
// YANLIŞ:
this.play.ballMode = 'REBOUND';
// bs.pos mevcut ball.x/y ile sync değil!

// DOĞRU:
this.setBallMode('REBOUND', { reboundVel });
// setBallMode içinde bs.pos.set(ball.x, ball.y) otomatik
```

---

## 🎯 Başlangıç Parametre Önerileri

```javascript
const RULES = {
  // Ball physics
  ballPickupDist: 18,           // Pickup mesafesi (px)
  ballPickupRelSpeed: 80,       // Max rel. speed for pickup
  ballFrictionRebound: 0.985,   // Rebound friction (per frame)
  ballFrictionLoose: 0.975,     // Loose ball friction (daha güçlü)
  
  // Shot system
  shotSpeed: 185,               // Shot velocity (px/s)
  shotZonePx: 110,              // Shot zone distance
  reboundMs: 520,               // Rebound duration
};
```

### Tuning Önerileri:

**Pickup çok agresif:** `ballPickupDist` ↓ (16-18), `ballPickupRelSpeed` ↓ (60-70)

**Pickup çok pasif:** `ballPickupDist` ↑ (20-22), `ballPickupRelSpeed` ↑ (100-120)

**Top çok hızlı duruyor:** `ballFrictionRebound` ↑ (0.990-0.995)

**Top çok kayıyor:** `ballFrictionRebound` ↓ (0.970-0.980)

---

## 📊 Migration Checklist

- [x] RULES'e ball physics parametreleri eklendi
- [x] `ensureBallState()` helper fonksiyonu
- [x] `setBallMode()` centralized mode switch
- [x] `setPossession()` centralized possession switch
- [x] `updateBall()` single entry point
- [x] `updateCarriedBall()` CARRIED logic
- [x] `updateShotBall()` SHOT logic
- [x] `updateLooseBall()` REBOUND logic + pickup
- [x] `checkBallPickup()` auto-pickup condition
- [x] `maybeStartShot()` setBallMode() kullanıyor
- [x] `endShotOutcome()` setBallMode() kullanıyor
- [x] `resetScene()` setBallMode() kullanıyor
- [x] `update()` loop'ta eski ball logic kaldırıldı
- [x] Render sync tek yerde (updateBall sonunda)

---

## 🧪 Test Senaryoları

### 1. **CARRIED → SHOT transition**
✅ Top smooth geçiş yapmalı (jitter yok)
✅ ballState.vel shot velocity olmalı
✅ Trail effect görünmeli

### 2. **SHOT → REBOUND transition (SAVE)**
✅ Top ışınlanmamalı (mevcut pozisyonda kalmalı)
✅ Deflection velocity doğru yönde
✅ Friction apply olmalı

### 3. **REBOUND → CARRIED transition (pickup)**
✅ Distance < 18px ve relSpeed < 80 ise otomatik pickup
✅ Possession doğru oyuncuya geçmeli
✅ vel sıfırlanmalı

### 4. **GOAL → CARRIED transition**
✅ Top attacker'a ışınlanmalı
✅ ballState.pos sync olmalı
✅ vel sıfırlanmalı

### 5. **Bounds collision (REBOUND)**
✅ Top sahada kalmalı (clamp)
✅ Bounce effect (vel *= -0.5)
✅ Damping apply olmalı

---

## 💡 Best Practices

1. **Asla `ball.x/y` direkt set etme** (sadece `ballState.pos` güncelle)
2. **Mode değişimlerinde `setBallMode()` kullan**
3. **Possession değişimlerinde `setPossession()` kullan**
4. **Render sync'i updateBall() sonunda otomatik olur**
5. **Physics hesaplamalarında sadece `ballState` kullan**
6. **dt clamp et** (stability için: `dt = clamp(dt, 0, 1/30)`)
7. **Vector2 allocation'ları minimize et** (scratch vectors kullan)

---

## 🔮 Gelecek İyileştirmeler (Sprint 2+)

- [ ] Ball spin physics (rotation + curve)
- [ ] Advanced collision (player body vs ball)
- [ ] Realistic dribble touch patterns
- [ ] Ball trail intensity based on velocity
- [ ] Tackle/intercept mechanics
- [ ] Pass system (player-to-player)
- [ ] Advanced keeper dive (reaction time)
- [ ] Ball shadow dynamic sizing
- [ ] Pitch friction zones (grass vs line)
- [ ] Weather effects (wind, rain impact)

---

## 📝 Notes

- `updateDribble()` zaten ballState'i update ediyor (değiştirme!)
- Legacy `play.ballVel` hala var (keeper tracking için), ama artık secondary
- Auto-pickup distance/speed değerleri playtesting ile fine-tune edilmeli
- REBOUND mode'da bounds collision agresif (bounce + damping)
- Pickup condition'ı oyun hissine göre ayarla (çok agresif = frustrating)

---

**Last Updated:** Sprint 1 / Gün 1  
**Status:** ✅ Production Ready
