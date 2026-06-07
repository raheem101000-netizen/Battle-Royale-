'use strict';

const W = 720, H = 480;
const TILE = 30;
const PLAYER_R = 8;
const BOT_R = 8;
const BULLET_R = 3;
const BULLET_SPEED = 7;

const BOT_SPEED = 1.2;
const PLAYER_SPEED = 2.4;
const BOT_SHOOT_RANGE = 220;
const BOT_SHOOT_RATE = 90;
const MAX_HP = 100;

function generateWalls() {
    const w = [];
    const patterns = [
        {x:4,y:3,w:3,h:1},{x:12,y:3,w:3,h:1},{x:20,y:3,w:3,h:1},
        {x:4,y:18,w:3,h:1},{x:12,y:18,w:3,h:1},{x:20,y:18,w:3,h:1},
        {x:2,y:8,w:1,h:4},{x:8,y:8,w:1,h:4},{x:15,y:8,w:1,h:4},{x:22,y:8,w:1,h:4},
        {x:2,y:13,w:1,h:4},{x:8,y:13,w:1,h:4},{x:15,y:13,w:1,h:4},{x:22,y:13,w:1,h:4},
        {x:5,y:10,w:4,h:2},{x:13,y:10,w:4,h:2},{x:19,y:6,w:2,h:2},{x:10,y:6,w:2,h:2},
        {x:10,y:15,w:2,h:2},{x:19,y:15,w:2,h:2},{x:6,y:5,w:2,h:1},{x:17,y:5,w:2,h:1},
    ];
    patterns.forEach(p => {
        for(let dx=0;dx<p.w;dx++)
            for(let dy=0;dy<p.h;dy++)
                w.push({x:(p.x+dx)*TILE, y:(p.y+dy)*TILE, w:TILE, h:TILE});
    });
    return w;
}

function isWall(x, y, r, walls) {
    return walls.some(w => x+r>w.x && x-r<w.x+w.w && y+r>w.y && y-r<w.y+w.h);
}

function isInZone(x, y, zoneSize) {
    return x>=zoneSize && x<=W-zoneSize && y>=zoneSize && y<=H-zoneSize;
}

function spawnPos(walls) {
    let x, y, tries = 0;
    do { x=40+Math.random()*(W-80); y=40+Math.random()*(H-80); tries++; }
    while(isWall(x,y,12,walls) && tries<100);
    return {x,y};
}

function moveEntity(e, dx, dy, walls) {
    const nx = e.x+dx*e.speed, ny = e.y+dy*e.speed;
    if(nx-e.r>=0 && nx+e.r<=W && !isWall(nx,e.y,e.r-1,walls)) e.x=nx;
    if(ny-e.r>=0 && ny+e.r<=H && !isWall(e.x,ny,e.r-1,walls)) e.y=ny;
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

    if(!isInZone(bot.x,bot.y,room.zoneSize)){ const toX=W/2-bot.x,toY=H/2-bot.y,len=Math.hypot(toX,toY)||1; dx=toX/len; dy=toY/len; }
    moveEntity(bot,dx,dy,room.walls);
    if(!isInZone(bot.x,bot.y,room.zoneSize)){ bot.hp-=0.3; if(bot.hp<=0) killInRoom(room,bot,io); }
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
        moveEntity(p,dx,dy,room.walls);
        p.angle=p.input.angle||0;
        if(p.input.shooting&&!p.reloading&&p.shootCooldown<=0){
            shootInRoom(room,p,p.x+Math.cos(p.angle)*100,p.y+Math.sin(p.angle)*100);
        }
        if(p.ammo===0&&!p.reloading){p.reloading=true;p.reloadTimer=90;}
        if(!isInZone(p.x,p.y,room.zoneSize)){p.hp-=0.4;if(p.hp<=0)killInRoom(room,p,io);}
    });

    players.filter(p=>p.alive&&p.isBot).forEach(p=>updateBotInRoom(room,p,io));

    room.bullets=room.bullets.filter(b=>{
        b.x+=b.vx; b.y+=b.vy; b.life--;
        if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H) return false;
        if(isWall(b.x,b.y,2,room.walls)) return false;
        for(const t of players){
            if(!t.alive||t.id===b.ownerId) continue;
            if(Math.hypot(b.x-t.x,b.y-t.y)<t.r+b.r){t.hp-=25;if(t.hp<=0)killInRoom(room,t,io);return false;}
        }
        return true;
    });

    io.to(room.id).emit('puz:state',{
        players:players.map(p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,angle:p.angle,alive:p.alive,color:p.color,name:p.name,isBot:p.isBot,ammo:p.ammo,maxAmmo:p.maxAmmo,reloading:p.reloading})),
        bullets:room.bullets.map(b=>({x:b.x,y:b.y,color:b.color})),
        zoneSize:room.zoneSize,
        aliveCount:room.aliveCount
    });
}

const puzRooms = {};

function createPuzRoom(roomId) {
    const walls=generateWalls();
    puzRooms[roomId]={id:roomId,players:{},bullets:[],walls,zoneSize:0,zoneTimer:30,placement:0,aliveCount:0,active:false,loop:null,zoneInterval:null};
    return puzRooms[roomId];
}

function addHumanPlayer(room, socketId, name, color) {
    const p=spawnPos(room.walls);
    room.players[socketId]={id:socketId,name,color,x:p.x,y:p.y,hp:MAX_HP,maxHp:MAX_HP,alive:true,isBot:false,angle:0,speed:PLAYER_SPEED,ammo:30,maxAmmo:30,reloading:false,reloadTimer:0,shootCooldown:0,r:PLAYER_R,input:{up:false,down:false,left:false,right:false,angle:0,shooting:false}};
    room.aliveCount++;
}

function addBot(room, i) {
    const colors=['#FF4444','#FFD700','#4BA8FF','#FF8C00','#DA70D6','#00CED1','#FF69B4'];
    const p=spawnPos(room.walls);
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

module.exports={createPuzRoom,addHumanPlayer,addBot,startPuzRoom,stopPuzRoom,puzRooms,W,H,generateWalls};
