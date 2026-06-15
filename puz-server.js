'use strict';

const MAP_CONFIGS = {
    2:{w:800,h:500,tile:30,zones:[{wait:60,shrinkTo:350,shrinkTime:25},{wait:40,shrinkTo:180,shrinkTime:20},{wait:25,shrinkTo:60,shrinkTime:15}]},
    3:{w:1000,h:650,tile:32,zones:[{wait:70,shrinkTo:420,shrinkTime:28},{wait:45,shrinkTo:220,shrinkTime:22},{wait:28,shrinkTo:80,shrinkTime:16}]},
    4:{w:1200,h:750,tile:35,zones:[{wait:75,shrinkTo:500,shrinkTime:30},{wait:50,shrinkTo:260,shrinkTime:25},{wait:30,shrinkTo:100,shrinkTime:18}]},
    5:{w:1500,h:950,tile:36,zones:[{wait:80,shrinkTo:620,shrinkTime:32},{wait:52,shrinkTo:320,shrinkTime:27},{wait:35,shrinkTo:130,shrinkTime:20},{wait:22,shrinkTo:60,shrinkTime:15}]},
    6:{w:1800,h:1100,tile:38,zones:[{wait:85,shrinkTo:750,shrinkTime:35},{wait:55,shrinkTo:400,shrinkTime:30},{wait:38,shrinkTo:180,shrinkTime:24},{wait:24,shrinkTo:70,shrinkTime:18}]},
    7:{w:2100,h:1300,tile:40,zones:[{wait:88,shrinkTo:850,shrinkTime:37},{wait:58,shrinkTo:480,shrinkTime:32},{wait:42,shrinkTo:240,shrinkTime:26},{wait:26,shrinkTo:90,shrinkTime:20}]},
    8:{w:2400,h:1500,tile:40,zones:[{wait:90,shrinkTo:900,shrinkTime:40},{wait:60,shrinkTo:600,shrinkTime:35},{wait:45,shrinkTo:380,shrinkTime:30},{wait:30,shrinkTo:200,shrinkTime:25},{wait:20,shrinkTo:80,shrinkTime:20}]},
};

const PLAYER_R = 8;
const BOT_R = 8;
const BULLET_R = 3;
const BULLET_SPEED = 7;
const BOT_SPEED = 1.2;
const PLAYER_SPEED = 2.4;
const BOT_SHOOT_RANGE = 220;
const BOT_SHOOT_RATE = 90;
const MAX_HP = 100;

function generateWalls(WW, WH, playerCount) {
    const walls = [];
    const blockW = Math.max(40, WW*0.05);
    const blockH = Math.max(30, WH*0.06);
    const positions = [
        {x:0.12,y:0.12},{x:0.30,y:0.10},{x:0.50,y:0.11},{x:0.70,y:0.10},{x:0.88,y:0.12},
        {x:0.20,y:0.28},{x:0.42,y:0.25},{x:0.58,y:0.25},{x:0.80,y:0.28},
        {x:0.35,y:0.45},{x:0.50,y:0.42},{x:0.65,y:0.45},{x:0.50,y:0.55},
        {x:0.20,y:0.65},{x:0.42,y:0.68},{x:0.58,y:0.68},{x:0.80,y:0.65},
        {x:0.12,y:0.82},{x:0.30,y:0.84},{x:0.50,y:0.83},{x:0.70,y:0.84},{x:0.88,y:0.82},
        {x:0.25,y:0.38,lx:true},{x:0.75,y:0.38,lx:true},
        {x:0.25,y:0.58,lx:true},{x:0.75,y:0.58,lx:true},
        {x:0.38,y:0.35,tall:true},{x:0.62,y:0.35,tall:true},
        {x:0.38,y:0.58,tall:true},{x:0.62,y:0.58,tall:true},
    ];
    const density = Math.min(1, (playerCount||8)/8);
    const count = Math.floor(positions.length * (0.4 + density*0.6));
    positions.slice(0, count).forEach(p => {
        const x = Math.round(p.x * WW);
        const y = Math.round(p.y * WH);
        if(p.tall) {
            walls.push({x, y, w:Math.max(15,WW*0.008), h:Math.max(80,WH*0.12)});
        } else if(p.lx) {
            walls.push({x, y, w:blockW, h:Math.max(12,WH*0.015)});
            walls.push({x, y, w:Math.max(12,WW*0.008), h:blockH});
        } else {
            const bw=blockW*(0.8+Math.random()*0.4), bh=blockH*(0.8+Math.random()*0.4);
            walls.push({x:x-bw/2, y:y-bh/2, w:bw, h:bh});
        }
    });
    return walls;
}

function isWall(x, y, r, walls) {
    return walls.some(w => x+r>w.x && x-r<w.x+w.w && y+r>w.y && y-r<w.y+w.h);
}

function isInZone(x, y, zoneSize, WW, WH) {
    return x>=zoneSize && x<=WW-zoneSize && y>=zoneSize && y<=WH-zoneSize;
}

function spawnPos(walls, WW, WH) {
    let x, y, tries = 0;
    do { x=40+Math.random()*(WW-80); y=40+Math.random()*(WH-80); tries++; }
    while(isWall(x,y,12,walls) && tries<100);
    return {x,y};
}

function moveEntity(e, dx, dy, walls, WW, WH) {
    const nx = e.x+dx*e.speed, ny = e.y+dy*e.speed;
    if(nx-e.r>=0 && nx+e.r<=WW && !isWall(nx,e.y,e.r-1,walls)) e.x=nx;
    if(ny-e.r>=0 && ny+e.r<=WH && !isWall(e.x,ny,e.r-1,walls)) e.y=ny;
}

function shootInRoom(room, shooter, tx, ty) {
    if(shooter.ammo<=0) { shooter.reloading=true; shooter.reloadTimer=90; return; }
    if(shooter.shootCooldown>0) return;
    const dx=tx-shooter.x, dy=ty-shooter.y, dist=Math.hypot(dx,dy);
    if(dist===0) return;
    const spread=(Math.random()-0.5)*0.06;
    room.bullets.push({
        x:shooter.x, y:shooter.y,
        vx:(dx/dist)*BULLET_SPEED+Math.cos(spread),
        vy:(dy/dist)*BULLET_SPEED+Math.sin(spread),
        ownerId:shooter.id, color:shooter.color, r:BULLET_R, life:80
    });
    shooter.ammo--; shooter.shootCooldown=12;
}

function updateBotInRoom(room, bot, io) {
    const WW=room.mapW, WH=room.mapH;
    if(!bot.alive) return;
    if(bot.reloading){ bot.reloadTimer--; if(bot.reloadTimer<=0){bot.reloading=false;bot.ammo=bot.maxAmmo;} return; }
    if(bot.shootCooldown>0) bot.shootCooldown--;

    const humans = Object.values(room.players).filter(p=>!p.isBot && p.alive);
    const target = humans[0];
    let dx=0, dy=0;

    if(target) {
        const dist=Math.hypot(target.x-bot.x, target.y-bot.y);
        if(dist<BOT_SHOOT_RANGE){
            const toX=target.x-bot.x, toY=target.y-bot.y, len=Math.hypot(toX,toY);
            dx=toX/len; dy=toY/len;
            bot.angle=Math.atan2(toY,toX);
            bot.shootTimer--;
            if(bot.shootTimer<=0){ shootInRoom(room,bot,target.x,target.y); bot.shootTimer=BOT_SHOOT_RATE+Math.floor(Math.random()*30); }
            if(bot.ammo<=5){ bot.reloading=true; bot.reloadTimer=90; }
        } else {
            bot.wanderTimer--;
            if(bot.wanderTimer<=0){
                bot.wanderAngle=Math.atan2(target.y-bot.y,target.x-bot.x)+(Math.random()-0.5)*0.8;
                bot.wanderTimer=40+Math.floor(Math.random()*60);
            }
            dx=Math.cos(bot.wanderAngle); dy=Math.sin(bot.wanderAngle);
            bot.angle=bot.wanderAngle;
            if(isWall(bot.x+dx*bot.speed*3,bot.y+dy*bot.speed*3,bot.r,room.walls)){ bot.wanderAngle+=Math.PI*(0.5+Math.random()); bot.wanderTimer=20; }
        }
    } else {
        bot.wanderTimer--;
        if(bot.wanderTimer<=0){ bot.wanderAngle+=(Math.random()-0.5)*1.2; bot.wanderTimer=40+Math.floor(Math.random()*60); }
        dx=Math.cos(bot.wanderAngle); dy=Math.sin(bot.wanderAngle);
        bot.angle=bot.wanderAngle;
        if(isWall(bot.x+dx*bot.speed*3,bot.y+dy*bot.speed*3,bot.r,room.walls)){ bot.wanderAngle+=Math.PI*(0.5+Math.random()); bot.wanderTimer=20; }
    }

    if(!isInZone(bot.x,bot.y,room.zoneSize,WW,WH)){ const toX=WW/2-bot.x,toY=WH/2-bot.y,len=Math.hypot(toX,toY)||1; dx=toX/len; dy=toY/len; }
    moveEntity(bot,dx,dy,room.walls,WW,WH);
    if(!isInZone(bot.x,bot.y,room.zoneSize,WW,WH)){ bot.hp-=0.3; if(bot.hp<=0) killInRoom(room,bot,io); }
}

function killInRoom(room, entity, io) {
    if(!entity.alive) return;
    entity.alive=false; room.aliveCount--;
    room.placement++;
    io.to(room.id).emit('puz:kill',{name:entity.name,color:entity.color,place:room.placement});
    const alive=Object.values(room.players).filter(p=>p.alive);
    if(alive.length===1){
        io.to(room.id).emit('puz:end',{winnerId:alive[0].id,winnerName:alive[0].name,total:Object.keys(room.players).length});
        stopPuzRoom(room);
    }
    if(alive.length===0) stopPuzRoom(room);
}

function puzTick(room, io) {
    const WW=room.mapW, WH=room.mapH;
    const players = Object.values(room.players);

    players.filter(p=>p.alive&&!p.isBot).forEach(p=>{
        if(p.reloading){ p.reloadTimer--; if(p.reloadTimer<=0){p.reloading=false;p.ammo=p.maxAmmo;} return; }
        if(p.shootCooldown>0) p.shootCooldown--;
        let dx=0,dy=0;
        if(p.input.up) dy=-1;
        if(p.input.down) dy=1;
        if(p.input.left) dx=-1;
        if(p.input.right) dx=1;
        if(dx&&dy){dx*=0.707;dy*=0.707;}
        moveEntity(p,dx,dy,room.walls,WW,WH);
        p.angle=p.input.angle||0;
        if(p.input.shooting&&!p.reloading&&p.shootCooldown<=0){
            shootInRoom(room,p,p.x+Math.cos(p.angle)*100,p.y+Math.sin(p.angle)*100);
        }
        if(p.ammo===0&&!p.reloading){p.reloading=true;p.reloadTimer=90;}
        if(!isInZone(p.x,p.y,room.zoneSize,WW,WH)){p.hp-=0.4;if(p.hp<=0)killInRoom(room,p,io);}
    });

    players.filter(p=>p.alive&&p.isBot).forEach(p=>updateBotInRoom(room,p,io));

    room.bullets=room.bullets.filter(b=>{
        b.x+=b.vx; b.y+=b.vy; b.life--;
        if(b.life<=0||b.x<0||b.x>WW||b.y<0||b.y>WH) return false;
        if(isWall(b.x,b.y,2,room.walls)) return false;
        for(const t of players){
            if(!t.alive||t.id===b.ownerId) continue;
            if(Math.hypot(b.x-t.x,b.y-t.y)<t.r+b.r){t.hp-=25;if(t.hp<=0)killInRoom(room,t,io);return false;}
        }
        return true;
    });

    io.to(room.id).emit('puz:state',{
        players:players.map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,angle:p.angle,alive:p.alive,color:p.color,name:p.name,isBot:p.isBot,ammo:p.ammo,maxAmmo:p.maxAmmo,reloading:p.reloading,r:p.r})),
        bullets:room.bullets.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,color:b.color})),
        zoneSize:room.zoneSize,
        aliveCount:room.aliveCount
    });
}

const puzRooms = {};

function createPuzRoom(roomId) {
    const cfg = MAP_CONFIGS[8];
    const walls = generateWalls(cfg.w, cfg.h, 8);
    puzRooms[roomId] = {
        id:roomId, players:{}, bullets:[], walls,
        mapW:cfg.w, mapH:cfg.h, tile:cfg.tile, zones:cfg.zones, playerCount:8,
        zoneSize:0, zoneTimer:30, placement:0, aliveCount:0,
        active:false, loop:null, zoneInterval:null
    };
    return puzRooms[roomId];
}

function applyMapConfig(room, playerCount) {
    playerCount = parseInt(playerCount) || 8;
    const cfg = MAP_CONFIGS[playerCount] || MAP_CONFIGS[8];
    room.mapW = cfg.w;
    room.mapH = cfg.h;
    room.tile = cfg.tile;
    room.zones = cfg.zones;
    room.playerCount = playerCount;
    room.walls = generateWalls(cfg.w, cfg.h, playerCount);
    // Reposition any already-joined players into the new map
    Object.values(room.players).forEach(p => {
        const pos = spawnPos(room.walls, cfg.w, cfg.h);
        p.x = pos.x; p.y = pos.y;
    });
}

function addHumanPlayer(room, socketId, name, color) {
    const p = spawnPos(room.walls, room.mapW, room.mapH);
    room.players[socketId]={id:socketId,name,color,x:p.x,y:p.y,hp:MAX_HP,maxHp:MAX_HP,alive:true,isBot:false,angle:0,speed:PLAYER_SPEED,ammo:30,maxAmmo:30,reloading:false,reloadTimer:0,shootCooldown:0,r:PLAYER_R,input:{up:false,down:false,left:false,right:false,angle:0,shooting:false}};
    room.aliveCount++;
}

function addBot(room, i) {
    const colors=['#FF4444','#FFD700','#4BA8FF','#FF8C00','#DA70D6','#00CED1','#FF69B4'];
    const p = spawnPos(room.walls, room.mapW, room.mapH);
    const botId='bot_'+i;
    room.players[botId]={id:botId,name:'Bot '+(i+1),color:colors[i%colors.length],x:p.x,y:p.y,hp:MAX_HP,maxHp:MAX_HP,alive:true,isBot:true,angle:0,speed:BOT_SPEED,ammo:30,maxAmmo:30,reloading:false,reloadTimer:0,shootCooldown:0,r:BOT_R,wanderAngle:Math.random()*Math.PI*2,wanderTimer:0,shootTimer:Math.floor(Math.random()*BOT_SHOOT_RATE)};
    room.aliveCount++;
}

function startPuzRoom(room, io) {
    room.active=true; room.zoneTimer=30;
    room.zoneInterval=setInterval(()=>{
        room.zoneTimer--;
        if(room.zoneTimer<=0){room.zoneSize+=18;room.zoneTimer=12;}
        io.to(room.id).emit('puz:zone',{zoneSize:room.zoneSize,timer:Math.max(0,room.zoneTimer)});
    },1000);
    room.loop=setInterval(()=>puzTick(room,io),16);
}

function stopPuzRoom(room) {
    room.active=false;
    if(room.loop){clearInterval(room.loop);room.loop=null;}
    if(room.zoneInterval){clearInterval(room.zoneInterval);room.zoneInterval=null;}
}

module.exports={createPuzRoom,applyMapConfig,addHumanPlayer,addBot,startPuzRoom,stopPuzRoom,puzRooms,generateWalls,MAP_CONFIGS};
