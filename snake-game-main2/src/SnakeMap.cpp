// SnakeMap.cpp

#include "SnakeMap.h"
#include <iostream>
#include <vector> 

MapHandler::MapHandler() {
    map = { nullptr };
    g1 = Gate();
    g2 = Gate();
    Growth = item();
    Poison = item();
    Speed = item();
}

// 무작위 아이템 위치 생성
item MapHandler::getRandomitems(const std::vector<Position>& snake) { 
    std::random_device rd;
    std::mt19937 mt_item(rd());
    std::uniform_int_distribution<int> itemY(1, maxHeight - 2);
    std::uniform_int_distribution<int> itemX(1, maxHeight - 2);
    int size = snake.size(); 

    while (true) {
        int y{ itemY(mt_item) };
        int x{ itemX(mt_item) };
        if (map[y][x] == '0') {  // check wall, item
            for (int i = 0; i < size; i++) {
                if (snake[i].y != y && snake[i].x != x) {  // check body
                    if (i == size - 1) {
                        return item{ y, x }; // 아이템 위치 반환
                    }
                }
            }
        }
    }
}

// 아이템 배치 1->Growth 2-> Poison  3->Speed up
void MapHandler::makeitems(int a, const std::vector<Position>& snake) { 
    switch (a)
    {
    case 1:
        putItem(Growth.y, Growth.x, '0');
        Growth = getRandomitems(snake); 
        putItem(Growth.y, Growth.x, '3');
        break;
    case 2:
        putItem(Poison.y, Poison.x, '0');
        Poison = getRandomitems(snake); 
        putItem(Poison.y, Poison.x, '4');
        break;
    case 3:
        putItem(Speed.y, Speed.x, '0');
        Speed = getRandomitems(snake); 
        putItem(Speed.y, Speed.x, '6');
        break;
    }
}
